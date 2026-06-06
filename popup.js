var chatId=null,isChat=false,selected=new Set(),toggles={thinking:false,tools:false},format='both';
var hn=document.getElementById('hostname'),tr=document.getElementById('toggleRow');
var st=document.getElementById('stats'),cl=document.getElementById('chatList');
var sc=document.getElementById('selectCount'),eb=document.getElementById('exportBtn');
var el=document.getElementById('exportLabel'),ld=document.getElementById('loading'),er=document.getElementById('error');
var pr=document.getElementById('progress'),pb=document.getElementById('progressBar'),pt=document.getElementById('progressText');
var cb=document.getElementById('copyBtn');
var exportPort=null;

function showProgress(pct,text){pr.style.display='block';var bar=pb.firstChild;if(bar)bar.style.width=pct+'%';else{bar=document.createElement('div');bar.style.cssText='height:4px;background:#4ade80;width:'+pct+'%';pb.appendChild(bar);}if(text)pt.textContent=text;}
function hideProgress(){pr.style.display='none';}

function show(){for(var i=0;i<arguments.length;i++)arguments[i].classList.remove('hidden');}
function hide(){for(var i=0;i<arguments.length;i++)arguments[i].classList.add('hidden');}
function setErr(m){hide(tr,st,cl,sc,eb,hn,ld);er.textContent='\u26a0 '+m;show(er);}

function connectExport(){
  if(exportPort)return exportPort;
  exportPort=browser.runtime.connect({name:'export'});
  exportPort.onDisconnect.addListener(function(){exportPort=null;});
  exportPort.onMessage.addListener(function(msg){
    if(msg.type==='progress')showProgress(msg.pct,msg.text);
    else if(msg.type==='done'){
      if(msg.ok){el.textContent='\u2713 Done';showProgress(100,'Done');}else setErr(msg.error);
      eb.style.opacity='1';var eab=document.getElementById('exportAllBtn');if(eab)eab.style.opacity='1';
    }
  });
  return exportPort;
}

async function init(){
  // Connect to background (will receive active export progress immediately)
  connectExport();
  
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

  var allLink=document.createElement('div');
  allLink.style.cssText='text-align:center;padding:4px 0;font-size:11px;opacity:.7;cursor:pointer';
  allLink.textContent='\u2b07 Export all conversations';
  allLink.addEventListener('click',function(){isChat=false;renderBatch();});
  document.getElementById('actionBar').parentNode.insertBefore(allLink,document.getElementById('actionBar').nextSibling);
}

function renderChatItem(c,nm){
  var d=document.createElement('div'),sp=document.createElement('span');
  d.className='chatItem';sp.textContent='\u2610 '+nm;d.appendChild(sp);
  var chk=false;
  d.addEventListener('click',function(){chk=!chk;sp.textContent=(chk?'\u2611':'\u2610')+' '+nm;if(chk)selected.add(c.id);else selected.delete(c.id);updateCount();});
  return d;
}

async function renderBatch(){
  show(ld);var r=await browser.runtime.sendMessage({type:'listChats'});hide(ld);
  if(!r.ok){setErr(r.error);return}
  hn.textContent='\ud83d\udcda All conversations';
  var chats=(r.chats||[]).sort(function(a,b){return new Date(b.updateTime)-new Date(a.updateTime);});
  var pua=/[\ue000-\uf8ff]/g;
  while(cl.firstChild)cl.removeChild(cl.firstChild);
  chats.forEach(function(c){
    var nm=(c.name||c.id).replace(pua,'');
    cl.appendChild(renderChatItem(c,nm));
  });

  while(sc.firstChild)sc.removeChild(sc.firstChild);
  var cnt=document.createElement('span');cnt.id='count';cnt.textContent='0 selected';
  var sa=document.createElement('span');sa.id='selectAll';sa.textContent='Select all';
  sc.appendChild(cnt);sc.appendChild(sa);
  sa.addEventListener('click',function(){
    var all=selected.size===chats.length;selected.clear();
    if(!all)chats.forEach(function(c){selected.add(c.id);});
    var items=document.querySelectorAll('.chatItem');
    items.forEach(function(t,i){t.firstChild.textContent=(all?'\u2610':'\u2611')+' '+(chats[i].name||chats[i].id).replace(pua,'');});
    updateCount();
  });
  el.textContent='Export selected';show(hn,cl,sc,eb,tr);

  var exportAllBtn=document.createElement('div');
  exportAllBtn.id='exportAllBtn';exportAllBtn.style.cssText='cursor:pointer;text-align:center;padding:4px 0;font-size:11px;opacity:.7;background:var(--surface);margin-top:1px';
  exportAllBtn.textContent='\u2b07 Export all '+chats.length+' chats';
  exportAllBtn.addEventListener('click',function(){
    exportAllBtn.style.opacity='0.4';hideProgress();eb.style.opacity='1';
    var port=connectExport();
    port.postMessage({type:'exportBatch',chatIds:chats.map(function(c){return c.id;}),options:Object.assign({},toggles,{format:format})});
  });
  document.getElementById('actionBar').parentNode.insertBefore(exportAllBtn,document.getElementById('actionBar').nextSibling);
}

function updateCount(){document.getElementById('count').textContent=selected.size+' selected';}

eb.addEventListener('click',function(){
  eb.style.opacity='0.4';hideProgress();
  var type=isChat?'exportSingle':'exportBatch';
  var port=connectExport();
  var payload=isChat?{type:type,chatId:chatId,options:Object.assign({},toggles,{format:format})}:{type:type,chatIds:Array.from(selected),options:Object.assign({},toggles,{format:format})};
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
