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
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.update_id !== undefined) { const cache=CacheService.getScriptCache(); const key='tg_'+body.update_id; if(cache.get(key))return ok(); cache.put(key,'1',21600); }
    const message = body.message;
    if (!message || !message.chat || !message.text) return ok();
    const chat = message.chat.id;
    const input = message.text.trim();
    const code = input.replace(/^\/start\s*/i, '').trim();
    if (/^\/start(?:\s|$)/i.test(input)) {
      if (code && code === P.getProperty('NASTYA_CODE')) {
        P.setProperty('NASTYA_CHAT_ID', String(chat));
        send(chat, 'Привет, Настя! Ты подключена к Напоминалкину. ✅');
      } else if (code && code === P.getProperty('SASHA_CODE')) {
        P.setProperty('SASHA_CHAT_ID', String(chat));
        send(chat, 'Привет, Саша! Ты подключён к Напоминалкину. ✅');
      } else {
        send(chat, 'Привет! Это Напоминалкин. Для подключения используй персональную ссылку от владельца. Команды: /help, /id');
      }
    } else if (input === '/id') {
      send(chat, 'ID этого чата: <code>' + chat + '</code>');
    } else if (input === '/help') {
      send(chat, 'Напоминалкин 🔔\n/start КОД — привязка аккаунта\n/id — ID чата\n/help — помощь\n\nУведомления о задачах станут доступны после подключения общего хранилища сайта.');
    } else if (input === '/test') {
      const authorized = [P.getProperty('NASTYA_CHAT_ID'), P.getProperty('SASHA_CHAT_ID')].includes(String(chat));
      if (authorized) send(chat, '🔔 Проверка связи: уведомления работают!');
      else send(chat, 'Сначала подключите аккаунт по персональной ссылке.');
    }
  } catch (err) {
    console.error(err);
  }
  return ok();
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
