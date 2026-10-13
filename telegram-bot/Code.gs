/**
 * Напоминалкин — Telegram-бот на бесплатном Google Apps Script.
 * Не добавляйте токен бота или личные коды в публичный репозиторий!
 * Script Properties: BOT_TOKEN, NASTYA_CODE, SASHA_CODE.
 */
const P = PropertiesService.getScriptProperties();
function api(method, payload) {
  const token = P.getProperty('BOT_TOKEN');
  if (!token) throw new Error('Add BOT_TOKEN in Script Properties');
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const result = JSON.parse(r.getContentText());
  if (!result.ok) throw new Error('Telegram ' + method + ': ' + result.description);
  return result.result;
}
function send(chatId, text) {
  return api('sendMessage', { chat_id: chatId, text: text, parse_mode: 'HTML' });
}
function safe(s) {
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
function handleUpdate(body) {
  const message=body.message;
  if (!message||!message.chat||!message.text) return;
  const chat=String(message.chat.id),input=message.text.trim();
  const code=input.replace(/^\/start\s*/i,'').trim();
  if (/^\/start(?:\s|$)/i.test(input)) {
    if (code && code===P.getProperty('NASTYA_CODE')) {
      P.setProperty('NASTYA_CHAT_ID',chat);
      send(chat,'Привет, Настя! Ты подключена к Напоминалкину. ✅');
    } else if (code && code===P.getProperty('SASHA_CODE')) {
      P.setProperty('SASHA_CHAT_ID',chat);
      send(chat,'Привет, Саша! Ты подключён к Напоминалкину. ✅');
    } else send(chat,'Привет! Используй свою персональную ссылку для подключения.');
  } else if(input==='/help') send(chat,'Напоминалкин 🔔\n/start КОД — привязка\n/id — ID чата\n/test — проверить');
  else if(input==='/id') send(chat,'ID чата: <code>'+chat+'</code>');
  else if(input==='/test') {
    const allowed=[P.getProperty('NASTYA_CHAT_ID'),P.getProperty('SASHA_CHAT_ID')].includes(chat);
    send(chat,allowed?'🔔 Проверка связи: уведомления работают!':'Сначала привяжи аккаунт через /start КОД');
  }
}
// Для Telegram используем polling вместо вебхука: Apps Script может отдавать redirect,
// из-за которого Telegram повторяет доставку одного update и бот спамит.
function doPost(e) { return ContentService.createTextOutput('Webhook disabled'); }
function stopWebhook() {
  return api('deleteWebhook',{drop_pending_updates:true});
}
function startPolling() {
  stopWebhook();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='pollTelegram')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  pollTelegram();
}
function stopPolling() {
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='pollTelegram')
    .forEach(t=>ScriptApp.deleteTrigger(t));
}
function pollTelegram() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try {
    const current=Number(P.getProperty('TELEGRAM_OFFSET')||0);
    const updates=api('getUpdates',{offset:current,limit:50,timeout:0,allowed_updates:['message']});
    for(const update of updates) {
      const next=Number(update.update_id)+1;
      // Сохраняем offset ДО отправки ответа, чтобы не спамить на повторном запуске.
      P.setProperty('TELEGRAM_OFFSET',String(next));
      try { handleUpdate(update); } catch(e) {console.error('Update '+update.update_id+': '+e); }
    }
  } finally {lock.releaseLock();}
}
function ok() { return ContentService.createTextOutput('ok'); }
function registerWebhook() {
  const url = P.getProperty('WEB_APP_URL');
  if (!url || !/^https:\/\/script\.google\.com\//.test(url)) throw new Error('Add WEB_APP_URL in Script Properties');
  return api('setWebhook', { url: url, drop_pending_updates: true });
}
function webhookInfo() { return api('getWebhookInfo', {}); }
function sendTestToBoth() {
  ['NASTYA_CHAT_ID', 'SASHA_CHAT_ID'].forEach(k => {
    const id = P.getProperty(k);
    if (id) send(id, '🔔 Напоминалкин подключён и готов принимать уведомления.');
  });
}
/**
 * Вызывайте только в доверенном серверном коде, не из публичного frontend.
 * recipient: 'Настя' либо 'Саша'
 */
function notifyRecipient(recipient, title, description, dueDate) {
  const key = recipient === 'Настя' ? 'NASTYA_CHAT_ID' : recipient === 'Саша' ? 'SASHA_CHAT_ID' : null;
  if (!key) throw new Error('Unknown recipient');
  const chatId = P.getProperty(key);
  if (!chatId) throw new Error('Recipient is not linked');
  return send(chatId, '📌 <b>Новое напоминание</b>\n' + safe(title) +
    (description ? '\n' + safe(description) : '') +
    (dueDate ? '\n🗓 ' + safe(dueDate) : ''));
}
