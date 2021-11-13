/**
 * 配置后加 # 注释的，表示该配置和环境相关，切换环境时需要重点关注这些配置项
 */

module.exports = {
  urlWithHash: true,
  edaAppPath: 'http://192.168.0.160:8090', // #
  port: 3004,
  testAccount: {
    ssoUrl: 'http://192.168.0.160:8089/sys/login', // #
    user: 'admin',
    password: '7YROgqoJsoqTWEoJddsNCQ==',  // 必须是加密后的密码
    auth: '/dataChart,/home,/charts,/initPage,/logout,ROLE_admin-group'
  },
  viewport: {
    isMobile: false,
    width: 1600,
    height: 900
  },
  errorDialogSelector: '.__errorDialog>p',
  dumpio: false,
  homeRoute: 'myEda',  // #
  debug: false,
  traceOpen: false,
  logDir: './logs',
  storage: 'sessionStorage',  // #
  defaultTimeout: 10 * 60 * 1000,
  defaultNaviTimeout: 10 * 60 * 1000,
  closePageWaitTimeout: 11 * 60 * 1000
}
