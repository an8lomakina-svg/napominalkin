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
        ss.getSheets()[0].appendRow(['id','from','to','title','due','done','created','reactions','type','content']);
        id=ss.getId();P.setProperty('TASK_SHEET_ID',id);
      }
    }finally{lock.releaseLock()}
  }
  const sheet=SpreadsheetApp.openById(id).getSheetByName('Tasks');
  if(sheet.getLastColumn()<10)sheet.getRange(1,9,1,2).setValues([['type','content']]);
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
    due:String(r[4]||''),done:r[5]===true,reactions:parseVotes(r[7]),type:String(r[8]||'text'),content:String(r[9]||'')
  })).reverse()};
}
function newReminder(code,title,due,type,content){
  const from=who(code),to=from==='Настя'?'Саша':'Настя';
  title=String(title||'').trim().slice(0,160);
  if(!title)throw Error('Напиши название');
  due=String(due||'').slice(0,16);
  if(due&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(due))throw Error('Неверная дата');
  type=['text','list','drawing'].indexOf(type)>-1?type:'text';
  content=String(content||'').slice(0,12000);
  taskSheet().appendRow([Utilities.getUuid(),from,to,title,due,false,new Date().toISOString(),'{}',type,content]);
  const chat=P.getProperty(to==='Настя'?'NASTYA_CHAT_ID':'SASHA_CHAT_ID');
  let sent=false;
  const label=type==='list'?'📝 Список: ':type==='drawing'?'🎨 Рисунок: ':'';
  if(chat)try{send(chat,'Новое напоминание от '+safe(from)+': '+label+safe(title)+(due?'\n'+safe(due):''));sent=true}catch(e){console.error(e)}
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
