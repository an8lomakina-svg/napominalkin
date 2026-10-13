// Add this file as Backend.gs in the same Apps Script project.
// Uses existing P, send(), safe() helpers from Code.gs.
function taskSheet(){
  let id=P.getProperty('TASK_SHEET_ID');
  if(!id){
    const lock=LockService.getScriptLock();lock.waitLock(15000);
    try{
      id=P.getProperty('TASK_SHEET_ID');
      if(!id){
        const ss=SpreadsheetApp.create('Напоминалкин - задачи');
        ss.getSheets()[0].setName('Tasks');
        ss.getSheets()[0].appendRow(['id','from','to','title','due','done','created','reactions','type','content','attachments']);
        id=ss.getId();P.setProperty('TASK_SHEET_ID',id);
      }
    }finally{lock.releaseLock()}
  }
  const sheet=SpreadsheetApp.openById(id).getSheetByName('Tasks');
  if(sheet.getLastColumn()<11)sheet.getRange(1,9,1,3).setValues([['type','content','attachments']]);
  return sheet;
}
function who(code){
  const n=P.getProperty('NASTYA_CODE'),s=P.getProperty('SASHA_CODE');
  if(!n||!s||n===s||n.length<4||s.length<4)throw Error('Use two different access codes of at least 4 characters');
  if(code===n)return 'Настя';
  if(code===s)return 'Саша';
  throw Error('Неверный код');
}
function reminders(code){
  const user=who(code);
  const rows=taskSheet().getDataRange().getValues().slice(1);
  return {user,tasks:rows.filter(r=>r[0]).map(r=>({
    id:String(r[0]),from:String(r[1]),to:String(r[2]),title:String(r[3]),
    due:String(r[4]||''),done:r[5]===true,reactions:parseVotes(r[7]),type:String(r[8]||'text'),content:String(r[9]||''),attachments:parseAttachments(r[10])
  })).reverse()};
}
function newReminder(code,title,due,type,content,attachments){
  const from=who(code),to=from==='Настя'?'Саша':'Настя';
  title=String(title||'').trim().slice(0,160);
  if(!title)throw Error('Напиши название');
  due=String(due||'').slice(0,16);
  if(due&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(due))throw Error('Неверная дата');
  type=['text','list','drawing'].indexOf(type)>-1?type:'text';
  content=String(content||'').slice(0,12000);
  const files=saveAttachments(attachments);
  taskSheet().appendRow([Utilities.getUuid(),from,to,title,due,false,new Date().toISOString(),'{}',type,content,JSON.stringify(files)]);
  const chat=P.getProperty(to==='Настя'?'NASTYA_CHAT_ID':'SASHA_CHAT_ID');
  let sent=false;
  const label=type==='list'?'📝 Список: ':type==='drawing'?'🎨 Рисунок: ':'';
  if(chat)try{send(chat,'Новое напоминание от '+safe(from)+': '+label+safe(title)+(due?'\n'+safe(due):'')+(files[0]?'\nЕсть вложение — открой его в Напоминалкине.':''));sent=true}catch(e){console.error(e)}
  return {sent,...reminders(code)};
}
function toggleReminder(code,id){
  const user=who(code),sh=taskSheet(),rows=sh.getDataRange().getValues();
  const i=rows.findIndex((r,k)=>k>0&&String(r[0])===String(id));
  if(i<0)throw Error('Не найдено');
  if(String(rows[i][2])!==user)throw Error('Это задача другого человека');
  const done=rows[i][5]!==true;sh.getRange(i+1,6).setValue(done);
  return reminders(code);
}
function doGet(){
  return HtmlService.createHtmlOutputFromFile('App').setTitle('Напоминалкин');
}

function authorizeDrive(){attachmentFolder();return 'ok'}
function attachmentFolder(){
  const key='ATTACHMENTS_FOLDER_ID',id=P.getProperty(key);
  if(id)try{return DriveApp.getFolderById(id)}catch(e){}
  const folder=DriveApp.createFolder('Напоминалкин — вложения');P.setProperty(key,folder.getId());return folder;
}
function saveAttachments(raw){
  const list=Array.isArray(raw)?raw:[];
  if(list.length>3)throw Error('Можно прикрепить не больше 3 файлов');
  return list.map(a=>{
    const name=String(a.name||'Вложение').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
    const data=String(a.data||'').replace(/^data:[^,]*,/,'');
    if(!data)throw Error('Не удалось прочитать вложение');
    const bytes=Utilities.base64Decode(data);
    if(bytes.length>5*1024*1024)throw Error('Один файл не должен быть больше 5 МБ');
    const file=attachmentFolder().createFile(Utilities.newBlob(bytes,String(a.mime||'application/octet-stream'),name));
    return {id:file.getId(),name:file.getName(),mime:file.getMimeType()};
  });
}
function parseAttachments(s){try{return JSON.parse(String(s||'[]'))}catch(e){return []}}
function attachmentData(code,id){
  who(code);
  const file=DriveApp.getFileById(String(id));
  const blob=file.getBlob();
  if(blob.getBytes().length>5*1024*1024)throw Error('Файл слишком большой для открытия');
  return {name:file.getName(),mime:blob.getContentType(),data:Utilities.base64Encode(blob.getBytes())};
}

function parseVotes(s){try{return JSON.parse(String(s||'{}'))}catch(e){return {}}}
function reactReminder(code,id,emoji){
 const user=who(code);
 if(!['👍','❤️','😂','🙏','🔥'].includes(emoji))throw Error('Недопустимая реакция');
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
  const sh=taskSheet(),rows=sh.getDataRange().getValues();
  const i=rows.findIndex((r,k)=>k>0&&String(r[0])===String(id));
  if(i<0)throw Error('Не найдено');
  const votes=parseVotes(rows[i][7]),by=votes[emoji]||{};
  by[user]=!by[user];votes[emoji]=by;
  sh.getRange(i+1,8).setValue(JSON.stringify(votes));
 }finally{lock.releaseLock()}
 return reminders(code);
}
