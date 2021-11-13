const config = require('./config');
const chalk = require('chalk');

const { logDir } = config;

function dateFormat (date, formatter = 'YYYY-MM-DD HH:mm:ss.SSS') {
  if (Object.prototype.toString.call(date) !== '[object Date]') {
    return date;
  }
  const fillTime = (time) => (time < 10) ? '0' + time : time;
  // YYYY-MM-DD HH:mm:ss
  formatter = formatter.replace('YYYY', date.getFullYear())
      .replace('MM', fillTime(date.getMonth() + 1))
      .replace(/DD/i, fillTime(date.getDate()))
      .replace('HH', fillTime(date.getHours()))
      .replace('mm', fillTime(date.getMinutes()))
      .replace('ss', fillTime(date.getSeconds()))
      .replace('SSS', fillTime(date.getMilliseconds()));
  return formatter;
}

module.exports = {
  info(...args) {
    const date = new Date()
    console.log(`[---][${dateFormat(date)}]` + chalk.cyan(...args));
  },
  error(...args) {
    const date = new Date()
    console.error(`[---][${dateFormat(date)}]` + chalk.red(...args));
  }
};