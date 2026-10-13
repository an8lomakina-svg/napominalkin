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
        ss.getSheets()[0].appendRow(['id','from','to','title','due','done','created']);
        id=ss.getId();P.setProperty('TASK_SHEET_ID',id);
      }
    }finally{lock.releaseLock()}
  }
  return SpreadsheetApp.openById(id).getSheetByName('Tasks');
}
function who(code){
  const n=P.getProperty('NASTYA_CODE'),s=P.getProperty('SASHA_CODE');
  if(!n||!s||n===s||n.length<12||s.length<12)throw Error('Use two different long access codes');
  if(code===n)return 'Настя';
  if(code===s)return 'Саша';
  throw Error('Неверный код');
}
function reminders(code){
  const user=who(code);
  const rows=taskSheet().getDataRange().getValues().slice(1);
  return {user,tasks:rows.filter(r=>r[0]).map(r=>({
    id:String(r[0]),from:String(r[1]),to:String(r[2]),title:String(r[3]),
    due:String(r[4]||''),done:r[5]===true
  })).reverse()};
}
function newReminder(code,title,due){
  const from=who(code),to=from==='Настя'?'Саша':'Настя';
  title=String(title||'').trim().slice(0,160);
  if(!title)throw Error('Напиши название');
  due=String(due||'').slice(0,16);
  if(due&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(due))throw Error('Неверная дата');
  taskSheet().appendRow([Utilities.getUuid(),from,to,title,due,false,new Date().toISOString()]);
  const chat=P.getProperty(to==='Настя'?'NASTYA_CHAT_ID':'SASHA_CHAT_ID');
  let sent=false;
  if(chat)try{send(chat,'Новое напоминание от '+safe(from)+': '+safe(title)+(due?'\n'+safe(due):''));sent=true}catch(e){console.error(e)}
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
