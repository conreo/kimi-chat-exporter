// Kimi Conversation Exporter

var authToken = null;
var activeExport = null;
var exportPorts = [];

function broadcast(type, data) {
  exportPorts = exportPorts.filter(function(p) {
    try { p.postMessage(Object.assign({type: type}, data)); return true; }
    catch(e) { return false; }
  });
}

browser.runtime.onConnect.addListener(function(port) {
  if (port.name !== 'export') return;
  exportPorts.push(port);
  port.onDisconnect.addListener(function() {
    exportPorts = exportPorts.filter(function(p) { return p !== port; });
  });

  // Send current status if an export is already running
  if (activeExport) {
    broadcast('progress', {pct: activeExport.pct, text: activeExport.text});
  }

  port.onMessage.addListener(async function(msg) {
    var s = await browser.storage.local.get(['thinking','tools','format']);
    var opt = {thinking:s.thinking||false,tools:s.tools||false,refs:true,format:s.format||'both'};
    if (msg.options) opt = msg.options;
    try {
      if (msg.type === 'exportSingle') {
        activeExport = {pct:0, text:''};
        await exportChat(msg.chatId, opt);
        activeExport = null;
        broadcast('done',{ok:true});
      }
      else if (msg.type === 'exportBatch') {
        if (activeExport) return; // already running
        activeExport = {pct:0, text:'0/0'};
        await exportAllWithProgress(msg.chatIds||[], opt);
        activeExport = null;
        broadcast('done',{ok:true});
      }
    } catch(e) { activeExport = null; broadcast('done',{ok:false,error:e.message}); }
  });
});

browser.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'setToken' && msg.token) authToken = msg.token;
  if (msg.type === 'getChatInfo') { handleGetChatInfo(msg.chatId).then(sendResponse); return true; }
  if (msg.type === 'getChatText') { handleGetChatText(msg.chatId, msg.options).then(sendResponse); return true; }
  if (msg.type === 'listChats') { handleListChats().then(sendResponse); return true; }
  if (msg.type === 'exportSingle') { exportChat(msg.chatId, msg.options||{}).then(function(){sendResponse({ok:true});}).catch(function(e){sendResponse({ok:false,error:e.message});}); return true; }
  if (msg.type === 'exportBatch') { exportAll(msg.options||{}).then(function(){sendResponse({ok:true});}).catch(function(e){sendResponse({ok:false,error:e.message});}); return true; }
});

async function handleGetChatInfo(chatId) {
  try {
    var name=chatId,createTime=null,token=null;
    do{var body=token?{page_size:50,page_token:token,query:''}:{page_size:50,query:''};var d=await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body);var f=(d.chats||[]).find(function(c){return c.id===chatId;});if(f){name=f.name;createTime=f.createTime;break;}token=d.nextPageToken;}while(token);
    var data=await kimiFetch('/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',{chatId:chatId});var msgs=data.messages||[];
    return{ok:true,title:name,messageCount:msgs.length,date:createTime||(msgs.length?msgs[msgs.length-1].createTime:'Unknown')};
  }catch(e){return{ok:false,error:e.message};}
}

async function handleListChats() {
  try {
    var chats=[],token=null;
    do{var body=token?{page_size:50,page_token:token,query:''}:{page_size:50,query:''};var d=await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body);var pageChats=d.chats||[];if(!pageChats.length)break;chats=chats.concat(pageChats);token=d.nextPageToken;}while(token);
    return{ok:true,chats:chats.map(function(c){return{id:c.id,name:c.name,createTime:c.createTime,updateTime:c.updateTime};})};
  }catch(e){return{ok:false,error:e.message};}
}

async function handleGetChatText(chatId, opts) {
  try {
    var name=chatId,token=null;
    do{var body=token?{page_size:50,page_token:token,query:''}:{page_size:50,query:''};var d=await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body);var f=(d.chats||[]).find(function(c){return c.id===chatId;});if(f){name=f.name;break;}token=d.nextPageToken;}while(token);
    var data=await kimiFetch('/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',{chatId:chatId});
    var msgs=data.messages||[];
    if(!msgs.length)return{ok:false,error:'No messages'};
    var mergedOpts={thinking:opts.thinking||false,tools:opts.tools||false,refs:true,format:'both'};
    var md=buildMD(msgs,name,chatId,mergedOpts);
    return{ok:true,text:md};
  }catch(e){return{ok:false,error:e.message};}
}

// --- ZIP Creator ---
function createZip(files) {
  var encoder=new TextEncoder(),centralDir=[],localHeaders=[],offset=0;
  files.forEach(function(f){
    var data=typeof f.data==='string'?encoder.encode(f.data):f.data,nameBytes=encoder.encode(f.name);
    var local=new Uint8Array(30+nameBytes.length+data.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0,true);
    lv.setUint32(14,crc32(data),true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nameBytes.length,true);lv.setUint16(28,0,true);
    local.set(nameBytes,30);local.set(data,30+nameBytes.length);localHeaders.push(local);
    var cd=new Uint8Array(46+nameBytes.length),cv=new DataView(cd.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);
    cv.setUint16(14,0,true);cv.setUint32(16,crc32(data),true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nameBytes.length,true);cv.setUint16(30,0,true);
    cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);cd.set(nameBytes,46);centralDir.push(cd);offset+=local.length;
  });
  var cdOffset=offset,cdSize=0;centralDir.forEach(function(c){cdSize+=c.length;});
  var eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,cdSize,true);ev.setUint32(16,cdOffset,true);
  var result=new Uint8Array(offset+cdSize+22),pos=0;
  localHeaders.forEach(function(l){result.set(l,pos);pos+=l.length;});centralDir.forEach(function(c){result.set(c,pos);pos+=c.length;});result.set(eocd,pos);
  return result;
}
function crc32(data){var crc=0xFFFFFFFF,arr=typeof data==='string'?new TextEncoder().encode(data):data;for(var i=0;i<arr.length;i++){crc^=arr[i];for(var j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xEDB88320:0);}return(crc^0xFFFFFFFF)>>>0;}

var PUA=/[\ue000-\uf8ff]/g;
function strip(s){return(s||'').replace(PUA,'');}
function safeFn(n){return(n||'untitled').replace(/[\\/:*?"<>|]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').substring(0,80)||'untitled';}

var KIMI_HEADERS={'Content-Type':'application/json','connect-protocol-version':'1','x-msh-platform':'web','x-msh-version':'1.0.0','x-language':'en-US'};

async function getToken(){if(authToken)return authToken;var tabs=await browser.tabs.query({url:'https://www.kimi.com/*'});if(tabs.length)return new Promise(function(resolve){browser.tabs.executeScript(tabs[0].id,{code:'localStorage.getItem("access_token")'},function(results){if(results&&results[0])authToken=results[0];resolve(authToken);});});return null;}

async function kimiFetch(endpoint,body){
  var token=await getToken(),headers=Object.assign({},KIMI_HEADERS);
  if(token)headers['Authorization']='Bearer '+token;
  var r=await fetch('https://www.kimi.com'+endpoint,{method:'POST',headers:headers,body:JSON.stringify(body),credentials:'include'});
  if(!r.ok){var t=await r.text();throw new Error(r.status===401||r.status===403?'Not logged into Kimi':'API error '+r.status+': '+t.substring(0,100));}
  return r.json();
}

function walkMsgs(msgs){
  var map=new Map();msgs.forEach(function(m){map.set(m.id,m);});
  var root=msgs.find(function(m){return m.parentId==='00000000-0000-0000-0000-000000000000'||m.role==='system';});
  if(!root)return[].concat(msgs).reverse();
  var res=[];function w(id){var m=map.get(id);if(!m)return;if(m.role!=='system')res.push(m);(m.childrenMessageIds||[]).forEach(w);}
  if(root.role==='system')(root.childrenMessageIds||[]).forEach(w);else{res.push(root);(root.childrenMessageIds||[]).forEach(w);}
  return res;
}

function buildMD(msgs,title,chatId,opts){
  var ord=walkMsgs(msgs),dt=msgs[msgs.length-1]?msgs[msgs.length-1].createTime:'Unknown';
  var md='# Kimi: '+strip(title)+'\n**Date:** '+dt+'\n**Chat ID:** '+chatId+'\n**Messages:** '+ord.length+'\n\n---\n\n',refs=[];
  ord.forEach(function(m){
    var role=m.role==='user'?'User':m.role==='assistant'?'Kimi':'System',parts=[];
    (m.blocks||[]).forEach(function(b){
      if(b.text&&b.text.content)parts.push(strip(b.text.content));
      else if(b.file&&b.file.meta)parts.push('📎 **'+strip(b.file.meta.name)+'** ('+(b.file.meta.sizeBytes||'?')+' bytes)');
      else if(b.think&&b.think.content&&opts.thinking)parts.push('<details>\n<summary>💭 Thinking</summary>\n\n'+strip(b.think.content)+'\n</details>');
      else if(b.tool&&b.tool.name&&opts.tools)parts.push('_🔧 '+b.tool.name+'_');
    });
    if(!parts.length)return;
    md+='### '+role+'\n'+parts.join('\n\n')+'\n\n';
    if(opts.refs&&m.references)m.references.forEach(function(r){(r.items||[]).forEach(function(i){if(i.search&&i.search.base&&i.search.base.url)refs.push({t:i.search.base.title||i.search.base.url,u:i.search.base.url});});});
  });
  if(opts.refs&&refs.length){var seen=new Set();md+='## References\n\n';refs.forEach(function(r){if(!seen.has(r.u)){seen.add(r.u);md+='- ['+strip(r.t)+']('+r.u+')\n';}});}
  return md;
}

async function exportChat(chatId,opts){
  var name=chatId,token=null;
  do{var body=token?{page_size:50,page_token:token,query:''}:{page_size:50,query:''};var d=await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body);var f=(d.chats||[]).find(function(c){return c.id===chatId;});if(f){name=f.name;break;}token=d.nextPageToken;}while(token);
  var data=await kimiFetch('/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',{chatId:chatId}),msgs=data.messages||[];
  if(!msgs.length)throw new Error('No messages');
  var fmt=opts.format||'both',md=buildMD(msgs,name,chatId,opts),json=JSON.stringify(data,null,2);
  var s=safeFn(name),now=new Date(),ds=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),fn=ds+'-'+s+'-Kimi';
  
  if(fmt==='both'){
    var zipFiles=[];
    zipFiles.push({name:fn+'.md',data:md});
    zipFiles.push({name:fn+'.json',data:json});
    var zipData=createZip(zipFiles),blobUrl=URL.createObjectURL(new Blob([zipData],{type:'application/zip'}));
    await browser.downloads.download({url:blobUrl,filename:fn+'.zip',saveAs:false});
    setTimeout(function(){URL.revokeObjectURL(blobUrl);},5000);
  }else if(fmt==='md'){
    var blobUrl=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));
    await browser.downloads.download({url:blobUrl,filename:fn+'.md',saveAs:false});
    setTimeout(function(){URL.revokeObjectURL(blobUrl);},5000);
  }else{
    var blobUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    await browser.downloads.download({url:blobUrl,filename:fn+'.json',saveAs:false});
    setTimeout(function(){URL.revokeObjectURL(blobUrl);},5000);
  }
}

async function exportAllWithProgress(chatIds, opts) {
  if (!chatIds || !chatIds.length) {
    var allChats = [], token = null;
    do { var body = token ? {page_size:50,page_token:token,query:''} : {page_size:50,query:''}; var d = await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body); if (!(d.chats||[]).length) break; allChats = allChats.concat(d.chats); token = d.nextPageToken; } while (token);
    chatIds = allChats.map(function(c){return c.id;}).slice(0,50);
  }
  var chats = chatIds.slice(0, 50), total = chats.length, files = [], errs = [];
  activeExport = {pct: 0, text: '0/'+total};
  broadcast('progress', {pct: 0, text: '0/'+total});
  await new Promise(function(r){setTimeout(r, 50);});
  for (var i = 0; i < chats.length; i++) {
    var cid = chats[i], nm = cid;
    try {
      var data = await kimiFetch('/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',{chatId:cid}), msgs = data.messages||[];
      if (!msgs.length) { errs.push(cid+'|'+nm+'|No messages'); continue; }
      try { var cd = await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',{page_size:50,query:''}); var found = (cd.chats||[]).find(function(c){return c.id===cid;}); if (found) nm = found.name; } catch(e) {}
      var fmt = opts.format||'both', md = buildMD(msgs, nm, cid, opts), s = safeFn(nm);
      var now = new Date(), ds = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'), fn = ds+'-'+s+'-Kimi';
      if (fmt==='both'||fmt==='md') files.push({name:fn+'.md', data:md});
      if (fmt==='both'||fmt==='json') files.push({name:fn+'.json', data:JSON.stringify(data,null,2)});
    } catch(e) { errs.push(cid+'|'+nm+'|'+e.message); }
    var pct = Math.round((i+1)/total*100);
    activeExport = {pct: pct, text: (i+1)+'/'+total};
    broadcast('progress', {pct: pct, text: (i+1)+'/'+total});
    await new Promise(function(r){setTimeout(r, 20);});
  }
  if (errs.length) files.push({name:'_export-errors.txt', data:errs.join('\n')});
  var zipData = createZip(files), blobUrl = URL.createObjectURL(new Blob([zipData],{type:'application/zip'}));
  await browser.downloads.download({url:blobUrl,filename:'Kimi-export-'+new Date().toISOString().split('T')[0]+'.zip',saveAs:false});
  setTimeout(function(){URL.revokeObjectURL(blobUrl);},5000);
}

async function exportAll(opts){
  var chats=[],token=null;
  do{var body=token?{page_size:50,page_token:token,query:''}:{page_size:50,query:''};var d=await kimiFetch('/apiv2/kimi.chat.v1.ChatService/ListChats',body);if(!(d.chats||[]).length)break;chats=chats.concat(d.chats);token=d.nextPageToken;}while(token);
  var ids=chats.map(function(c){return c.id;}).slice(0,50),files=[],errs=[];
  browser.action.setBadgeBackgroundColor({color:'#4ade80'});
  for(var i=0;i<ids.length;i++){
    var cid=ids[i],nm=cid;
    browser.action.setBadgeText({text:(i+1)+'/'+ids.length});
    try{
      var found=chats.find(function(c){return c.id===cid;});if(found)nm=found.name;
      var data=await kimiFetch('/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',{chatId:cid}),msgs=data.messages||[];
      if(!msgs.length){errs.push(cid+'|'+nm+'|No messages');continue;}
      var fmt=opts.format||'both',md=buildMD(msgs,nm,cid,opts),s=safeFn(nm);
      var now=new Date(),ds=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),fn=ds+'-'+s+'-Kimi';
      if(fmt==='both'||fmt==='md')files.push({name:fn+'.md',data:md});
      if(fmt==='both'||fmt==='json')files.push({name:fn+'.json',data:JSON.stringify(data,null,2)});
    }catch(e){errs.push(cid+'|'+nm+'|'+e.message);}
  }
  browser.action.setBadgeText({text:errs.length?'DONE':'OK'});setTimeout(function(){browser.action.setBadgeText({text:''});},3000);
  if(errs.length)files.push({name:'_export-errors.txt',data:errs.join('\n')});
  var zipData=createZip(files),blobUrl=URL.createObjectURL(new Blob([zipData],{type:'application/zip'}));
  await browser.downloads.download({url:blobUrl,filename:'Kimi-export-'+new Date().toISOString().split('T')[0]+'.zip',saveAs:false});
  setTimeout(function(){URL.revokeObjectURL(blobUrl);},5000);
}

var opts={thinking:false,tools:false,refs:true,format:'both'};
browser.storage.local.get(['thinking','tools','format']).then(function(s){opts.thinking=s.thinking||false;opts.tools=s.tools||false;opts.format=s.format||'both';});

browser.runtime.onInstalled.addListener(function(){
  browser.menus.removeAll(function(){
    browser.menus.create({id:'export-chat',title:'Export this conversation',contexts:['page'],documentUrlPatterns:['https://www.kimi.com/chat/*']});
    browser.menus.create({id:'export-all',title:'Export all conversations',contexts:['page'],documentUrlPatterns:['https://www.kimi.com/*']});
  });
});

// Also register immediately (for first install before onInstalled fires)
browser.menus.removeAll(function(){
  browser.menus.create({id:'export-chat',title:'Export this conversation',contexts:['page'],documentUrlPatterns:['https://www.kimi.com/chat/*']});
  browser.menus.create({id:'export-all',title:'Export all conversations',contexts:['page'],documentUrlPatterns:['https://www.kimi.com/*']});
});

browser.menus.onClicked.addListener(async function(info,tab){
  if(!tab||!tab.url||!tab.url.includes('kimi.com'))return;
  var s=await browser.storage.local.get(['thinking','tools','format']),opt={thinking:s.thinking||false,tools:s.tools||false,refs:true,format:s.format||'both'};
  if(info.menuItemId==='export-chat'){var m=tab.url.match(/\/chat\/([a-f0-9-]+)/);if(!m)return;try{await exportChat(m[1],opt);}catch(e){console.error(e);}}
  else if(info.menuItemId==='export-all'){try{await exportAll(opt);}catch(e){console.error(e);}}
});

console.log('Kimi Export ready');
