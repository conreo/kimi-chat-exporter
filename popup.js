var chatId=null,isChat=false,selected=new Set(),toggles={thinking:false,tools:false},format='both';
var hn=document.getElementById('hostname'),tr=document.getElementById('toggleRow');
var st=document.getElementById('stats'),cl=document.getElementById('chatList');
var sc=document.getElementById('selectCount'),eb=document.getElementById('exportBtn');
var el=document.getElementById('exportLabel'),ld=document.getElementById('loading'),er=document.getElementById('error');
var pr=document.getElementById('progress'),pb=document.getElementById('progressBar'),pt=document.getElementById('progressText');
var cb=document.getElementById('copyBtn');

function showProgress(pct,text){pr.style.display='block';pb.innerHTML='<div style="width:'+pct+'%"></div>';if(text)pt.textContent=text;}
function hideProgress(){pr.style.display='none';}

function show(){for(var i=0;i<arguments.length;i++)arguments[i].classList.remove('hidden');}
function hide(){for(var i=0;i<arguments.length;i++)arguments[i].classList.add('hidden');}
function setErr(m){hide(tr,st,cl,sc,eb,hn,ld);er.textContent='\u26a0 '+m;show(er);}

async function init(){
  var s=await browser.storage.local.get(['thinking','tools','format']);
  toggles.thinking=s.thinking||false;toggles.tools=s.tools||false;
  format=s.format||'both';
  document.querySelectorAll('.fmt').forEach(function(f){
    if(f.dataset.fmt===format)f.classList.add('sel');
    f.addEventListener('click',function(){
      document.querySelectorAll('.fmt').forEach(function(x){x.classList.remove('sel');});
      f.classList.add('sel');format=f.dataset.fmt;browser.storage.local.set({format:format});
    });
  });
  var tabs=await browser.tabs.query({active:true,currentWindow:true});
  var url=tabs[0].url||'',m=url.match(/\/chat\/([a-f0-9-]+)/);
  isChat=!!(m&&url.includes('kimi.com'));chatId=m?m[1]:null;
  document.querySelectorAll('.toggle').forEach(function(t){
    var k=t.dataset.key;if(toggles[k])t.classList.add('on');
    t.addEventListener('click',function(){toggles[k]=!toggles[k];t.classList.toggle('on',toggles[k]);browser.storage.local.set({[k]:toggles[k]});});
  });
  if(isChat)await renderSingle();else await renderBatch();
}

async function renderSingle(){
  show(ld);var r=await browser.runtime.sendMessage({type:'getChatInfo',chatId:chatId});hide(ld);
  if(!r.ok){setErr(r.error);return}
  hn.textContent=r.title;st.textContent=r.messageCount+' messages \u00b7 '+new Date(r.date).toLocaleDateString();
  el.textContent='Export';show(hn,tr,st,eb,cb);
  
  // Add "Export all" link below
  var allLink=document.createElement('div');
  allLink.style.cssText='text-align:center;padding:4px 0;font-size:11px;opacity:.7;cursor:pointer';
  allLink.textContent='⬇ Export all conversations';
  allLink.addEventListener('click',function(){isChat=false;renderBatch();});
  document.getElementById('actionBar').parentNode.insertBefore(allLink,document.getElementById('actionBar').nextSibling);
}

async function renderBatch(){
  show(ld);var r=await browser.runtime.sendMessage({type:'listChats'});hide(ld);
  if(!r.ok){setErr(r.error);return}
  hn.textContent='\ud83d\udcda All conversations';
  var chats=(r.chats||[]).sort(function(a,b){return new Date(b.updateTime)-new Date(a.updateTime);});
  var pua=/[\ue000-\uf8ff]/g;
  cl.innerHTML='';chats.forEach(function(c){
    var nm=(c.name||c.id).replace(pua,''),d=document.createElement('div');
    d.className='chatItem';d.innerHTML='\u2610 '+nm;
    d.addEventListener('click',function(){if(selected.has(c.id)){selected.delete(c.id);d.innerHTML='\u2610 '+nm;}else{selected.add(c.id);d.innerHTML='\u2611 '+nm;}updateCount();});
    cl.appendChild(d);
  });
  sc.innerHTML='<span id=\"count\">0 selected</span><span id=\"selectAll\">Select all</span>';
  document.getElementById('selectAll').addEventListener('click',function(){
    var all=selected.size===chats.length;selected.clear();
    if(!all)chats.forEach(function(c){selected.add(c.id);});
    document.querySelectorAll('.chatItem').forEach(function(t,i){t.innerHTML=all?'\u2610 '+(chats[i].name||chats[i].id).replace(pua,''):'\u2611 '+(chats[i].name||chats[i].id).replace(pua,'');});
    updateCount();
  });
  el.textContent='Export selected';show(hn,cl,sc,eb,tr);
  
  // Add quick "Export all" button
  var exportAllBtn=document.createElement('div');
  exportAllBtn.id='exportAllBtn';exportAllBtn.style.cssText='cursor:pointer;text-align:center;padding:4px 0;font-size:11px;opacity:.7;background:var(--surface);margin-top:1px';
  exportAllBtn.innerHTML='⬇ Export all '+chats.length+' chats';
  exportAllBtn.addEventListener('click',function(){
    exportAllBtn.style.opacity='0.4';hideProgress();
    var opts=Object.assign({},toggles,{format:format});
    var port=browser.runtime.connect({name:'export'});
    port.onMessage.addListener(function(msg){
      if(msg.type==='progress')showProgress(msg.pct,msg.text);
      else if(msg.type==='done'){
        exportAllBtn.style.opacity='1';
        if(msg.ok){exportAllBtn.textContent='✓ Done';showProgress(100,'Done');}
        else exportAllBtn.textContent='⚠ '+msg.error;
        port.disconnect();
      }
    });
    port.postMessage({type:'exportBatch',chatIds:chats.map(function(c){return c.id;}),options:opts});
  });
  document.getElementById('actionBar').parentNode.insertBefore(exportAllBtn,document.getElementById('actionBar').nextSibling);
}

function updateCount(){document.getElementById('count').textContent=selected.size+' selected';}

eb.addEventListener('click',async function(){
  eb.style.opacity='0.4';hideProgress();
  var type=isChat?'exportSingle':'exportBatch';
  var opts=Object.assign({},toggles,{format:format});
  
  var port=browser.runtime.connect({name:'export'});
  port.onMessage.addListener(function(msg){
    if(msg.type==='progress'){showProgress(msg.pct,msg.text);}
    else if(msg.type==='done'){
      eb.style.opacity='1';
      if(msg.ok){el.textContent='\u2713 Done';showProgress(100,'Done');}
      else setErr(msg.error);
      port.disconnect();
    }
  });
  
  var payload=isChat?{type:type,chatId:chatId,options:opts}:{type:type,chatIds:[].slice.call(selected),options:opts};
  port.postMessage(payload);
});

// Copy button handler
cb.addEventListener('click',async function(){
  cb.style.opacity='0.4';
  cb.classList.remove('copied','failed');
  try{
    var r=await browser.runtime.sendMessage({type:'getChatText',chatId:chatId,options:Object.assign({},toggles,{format:format})});
    if(r&&r.text){
      await navigator.clipboard.writeText(r.text);
      cb.classList.add('copied');
      cb.querySelector('.label').textContent='Copied';
      setTimeout(function(){cb.classList.remove('copied');cb.querySelector('.label').textContent='Copy';},2000);
    }else{
      cb.classList.add('failed');
      cb.querySelector('.label').textContent='Failed';
      setTimeout(function(){cb.classList.remove('failed');cb.querySelector('.label').textContent='Copy';},2000);
    }
  }catch(e){
    cb.classList.add('failed');
    cb.querySelector('.label').textContent='Failed';
    setTimeout(function(){cb.classList.remove('failed');cb.querySelector('.label').textContent='Copy';},2000);
  }
  cb.style.opacity='1';
});

init();
