const puppeteer = require('puppeteer');
const chalk = require('chalk');
const Log = require('./Log');
const axios = require('axios')

const request = axios.create();
const config = require('./config');
const { testAccount: { ssoUrl, user, password, auth }, viewport, errorDialogSelector,
  debug, traceOpen, storage, defaultTimeout, defaultNaviTimeout, closePageWaitTimeout,
  dumpio, homeRoute } = config;

const { renderState, emptyResult } = require('./Constants')

let accessToken = '';
let refreshToken = '';

// 存放当前渲染的 chart 状态及其结果
let taskList = {}

/**
 * Render 必须被同步请求，不支持并发渲染
 */
module.exports = {
  async getToken(page) {
    let token = {}
    // 对 token 进行缓存，若缓存的 token 过期，则页面会自动进行刷新
    if (!accessToken && !refreshToken) {
      const tokenRes = await request({
        url: ssoUrl,
        method: 'post',
        params: {
          username: user,
          password,
        },
      }).catch(e => {
        Log.info('got token failed: ', JSON.stringify(e))
      });
      if (!tokenRes.data.access_token) {
        throw Error("login failed." + JSON.stringify((tokenRes.data || 'wrong')));
      }
      Log.info('request token...')
      token = tokenRes.data
      accessToken = token.access_token
      refreshToken = token.refresh_token
    } else {
      Log.info('read cached token...')
      token = {
        access_token: accessToken,
        refresh_token: refreshToken
      }
    }

    await page.evaluate((evtUser, storage, token) => {
      const { access_token, refresh_token } = token;
      window[storage].setItem("userId", evtUser);
      window[storage].setItem("access_token", access_token);
      window[storage].setItem("refresh_token", refresh_token);

      let success_time = new Date().toString();
      window[storage].setItem("token_time", success_time);
    }, user, storage, token).catch(e => Log.error('change user', e));
  },

  /**
   * 执行完成，将页面上的 token 更新到本地
   * @return {Promise<void>}
   */
  async updateToken(page) {
    const tokens = await page.evaluate((storage, accessToken, refreshToken) => {
      return {
        accessToken: window[storage].getItem("access_token") || accessToken,
        refreshToken: window[storage].getItem("refresh_token") || refreshToken
      }
    }, storage, accessToken, refreshToken).catch(e => Log.error('update token failed', e));
    accessToken = tokens.accessToken
    refreshToken = tokens.refreshToken
  },

  async doAuth(page) {
    await page.evaluate((auth, storage) => {
      let role = auth.split(',').find(v => v.startsWith('ROLE_')).replace('ROLE_', '')
      window[storage].setItem('auth', auth);
      window[storage].setItem('role', role);
    }, auth, storage)
  },

  /**
   * 客户端确认收到渲染结果后，主动删除
   * @param uid
   * @param force 是否强制删除而不管该任务的结果有没有被取走
   * @return {boolean} 清除成功与否
   */
  removeTaskResult(uid, force = false) {
    if (!taskList.hasOwnProperty(uid)) {
      throw new Error('uid not exist...: ' + uid)
    }
    const ret = taskList[uid]
    if (force) {
      delete taskList[uid]
      Log.info(uid + ' force remove task...')
      return true
    }
    if (renderState.isDone(ret.state)) {
      delete taskList[uid]
      Log.info(uid + ' remove task...')
      return true
    } else {
      return false
    }
  },

  /**
   * 客户端确认某次渲染是否完成
   * @param uid
   * @return {*}
   */
  checkRenderResult(uid) {
    if (!taskList.hasOwnProperty(uid)) {
      return emptyResult(renderState.ERROR, uid, 'uid 错误: 不存在')
    }
    Log.info(uid + ' check render result...')
    return taskList[uid]
  },

  /**
   * 异步渲染
   */
  renderAsync(homeUrl = "", url = "", evtUser = "", uid) {
    taskList[uid] = emptyResult(renderState.PENDING, uid)
    setTimeout(async () => {
      try {
        await this.go(homeUrl, url, evtUser, uid, true)
      } catch (e) {
        Log.error(uid + ' render error:', e);
        taskList[uid] = emptyResult(renderState.ERROR, uid,' render error:' + e)
      }
    }, 0)
  },

  /**
   * chart 重渲染步骤：
   * 1. 使用 admin 账户登录，后切换缓存中的用户名为 evtUser， 便于 chart 模块请求到正确的数据
   * 2. 按特定 URL 进入 chart 模块后，chart 模块会自动获取之前保存的条件，且自动用新数据渲染 chart 列表中的最后一个
   * 3. 如果左边 chart 列表有多个 chart, 则需要挨个双击展现，会自动渲染出图
   * 4. 双击展现后，点击执行 chart ，得到生成的 chart 的 base64 码
   * 5. 将该 chart 的 base64 码数组（可能包含多个）存储到 id 为 current-charts-base64 的 dom 里
   * 6. puppeteer 取值返回
   *
   * 生成的 chart 与 blockId 的绑定逻辑：
   * 1. 左边表格一个 chart 设定对应一个 blockId
   * 2. 一个 chart 设定可以生成多个图，则这多个图都绑定在同一个 blockId 中，用数组存放
   * @param {string} homeUrl 登录 URL
   * @param {string} url chart url, 包含其上游 elementId, 本身 elementId, chartId
   * @param {string} evtUser chart 所属用户
   * @param {string} uid 请求的时间，作为唯一 id
   * @param {boolean} isAsync 请求是否异步
   */
  async go(homeUrl = "", url = "", evtUser = "", uid, isAsync = false) {
    // login
    const page = await this.loginSimulate(homeUrl, uid);
    if (traceOpen) {
      await page.tracing.start({ path: "./trace.json", screenshot: true });
    }
    Log.info(uid + " login page end");

    // 切换缓存中的用户名为 evtUser
    await page.evaluate((evtUser, storage) => {
      window[storage].setItem('userId', evtUser);
    }, evtUser, storage).catch(e => Log.error('change user', e));
    Log.info(uid + ' change user end....')

    // 加载 chart 模块
    await page.goto(url, { waitUnitl: ["domcontentloaded", "networkidle0"] });
    Log.info(uid + " navi to main page");

    // 此时 chart 模块初始化的步骤结束
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('#tab-second.is-active')).some(tab => tab.innerText === 'Chart')
    }, {polling: 1000})
    Log.info(uid + " ready to execute")

    // 检索所有 chart
    const charts = await page.$$('#chartsTable table tr.el-table__row').catch(e => {
      Log.error(uid + ' no charts found...', e);
      throw Error('no charts found...');
    });
    if (charts.length < 1) {
      Log.error(uid + " no charts found...");
      throw Error("no charts found or chart lose...");
    }
    Log.info(uid + " got charts to render: " + charts.length);

    // 循环处理所有 chart
    let chartBase64 = [];
    for (let i = 0; i < charts.length; i++) {
      // 双击展示 chart
      Log.info(uid + " execute one start");
      const chartClassName = `.rowChart${i + 1}`;
      const chartName = await this.getChartName(page, chartClassName);
      await this.dblClick(page, chartClassName);

      // 双击也会走一遍"删除-重建"的操作，所以需要等到执行完才能继续下面的步骤，否则会导致'重建'失败
      await this.waitForDomAppear(page, "#show-chart-done");
      Log.info(uid + " dblclick end");

      // 双击结束，切换到 setting 页执行 chart
      const base64List = await this.executeChart(page, uid);
      Log.info(`${uid} execute one...., size: ${base64List.length}, info: ${base64List.map(v => v.chartTitle)}`)

      chartBase64.push({
        chartName,
        base64List
      })
      Log.info(uid + " ^^^^^ done one vvvvv" + (i + 1));
    }
    if (traceOpen) {
      await page.tracing.stop();
    }
    Log.error(uid + " done all. update token");
    await this.updateToken(page)
    /**
     * FIXME: 防止因页面早早被关闭导致“删除-重建“操作被中途阻断，导致“重建“操作未执行的临时解决方案。
     * 最终还是需要将“删除-重建“的操作进行规范
     */
    setTimeout(async () => {
      await page.close();
      await page.browser().close();
      Log.info(uid + " close browser instance.....");
    }, closePageWaitTimeout);
    if (isAsync) {
      taskList[uid].state = renderState.DONE
      taskList[uid].result = chartBase64;
    }
    return chartBase64;
  },

  async getChartName(page, chartClassName) {
    return await page.evaluate(chartClassName => {
      const chartNameDom = document.querySelector(`${chartClassName} td:nth-child(2)`);
      return chartNameDom ? chartNameDom.innerText : '';
    }, chartClassName);
  },

  /**
   * 操作页面执行 chart
   * @param {Page} page
   * @return Promise([])
   */
  async executeChart(page, uid) {
    // 切换到 setting 页
    const tab = await page.$("#tab-first");
    await tab.evaluate((t) => t.click());
    Log.info(`${uid} --- switch to setting..`);

    const button = await page.$("#execute");
    await button.evaluate((btn) => btn.click());
    await this.waitForDomAppear(page, "#current-charts-base64");
    Log.info(`${uid} --- execute done`);

    const base64Str = await page.evaluate(() => {
      const chartsBase64 = document.querySelector("#current-charts-base64");
      return chartsBase64 ? JSON.parse(chartsBase64.innerText) : [];
    });
    Log.info(`${uid} --- got base64: ${base64Str.length}`);
    return base64Str;
  },

  async dblClick(page, selector) {
    await page.evaluate((selector) => {
      var targLink = document.querySelector(selector);
      var clickEvent = document.createEvent("MouseEvents");
      clickEvent.initEvent("dblclick", true, true);
      targLink.dispatchEvent(clickEvent);
    }, selector);
  },

  // async dblClick(page, selector) {
  //   const rect = await page.evaluate((selector) => {
  //     const element = document.querySelector(selector);
  //     if (!element) return null;
  //     const { x, y } = element.getBoundingClientRect();
  //     return { x, y };
  //   }, selector);
  //   if (rect) {
  //     await page.mouse.click(rect.x, rect.y, { button: 'middle', clickCount: 2 });
  //   } else {
  //     console.error("Element Not Found");
  //     return null;
  //   }
  // },

  async waitForDomAppear(page, selector) {
    await page.waitForFunction(
        (selector) => !!document.querySelector(selector),
        { polling: 1000 }, selector);
  },

  async errorHandler(page) {
    await this.waitForDomAppear(page, errorDialogSelector);
    await page.screenshot({ path: "./error/err.png" });
  },

  /**
   * 启动一个浏览器实例待命
   */
  async getPage(uid) {
    let browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      dumpio,
    });
    Log.info(uid + " create new browser");
    // 清理
    // if (browserPool.length > 5) {
    //   Log.info(uid + ' do browser clean...')
    //   await this.close();
    // }
    // browserPool.push(browser);
    const page = await browser.newPage();
    Log.info(uid + " got new page....");
    await page.setViewport({
      isMobile: false,
      width: 1600,
      height: 900,
      ...viewport,
    });
    await page.setJavaScriptEnabled(true);
    await this.regiserRequestEvt(page);
    // await page.on('console', msg => {
    //   console.log('log::::', chalk.red(msg.args()[0]));
    // })
    // await this.errorHandler(page);
    page.setDefaultNavigationTimeout(defaultNaviTimeout);
    page.setDefaultTimeout(defaultTimeout);
    return page;
  },

  async loginSimulate(homeUrl = "", uid) {
    Log.info(uid + ' loginSimulate...')
    const page = await this.getPage(uid);
    await page.goto(homeUrl);
    await this.getToken(page)
    Log.info(uid + ' got token...')

    await this.doAuth(page);
    Log.info(uid + ' do auth...')
    Log.info("login success.......");
    return page;
  },

  async login(homeUrl = "", uid) {
    const page = await this.getPage(uid);
    await page.goto(homeUrl);
    Log.info(uid + " goto login page");
    await page.type("input[type=text]", user);
    await page.type("input[type=password]", password);
    Log.info("input done.....");

    await page.click("button");
    await page.waitForFunction(
        (home) => window.location.href.includes(home),
        { polling: 1000 },
        homeRoute
    );
    // await Promise.all([
    //   page.waitForNavigation({ waitUnitl: ['networkidle0'] }), // The promise resolves after navigation has finished
    //   page.click('button'), // 点击该链接将间接导致导航(跳转)
    // ]);
    Log.info("login success.......");
    return page;
  },

  async regiserRequestEvt(page) {
    if (!debug) {
      return;
    }
    await page.setRequestInterception(true);
    page.on('request', req => {
      console.log(chalk.blue(`req info: 
                    url: ${req.url()}
                    headers: ${JSON.stringify(req.headers())}
                    method: ${req.method()}
                    postData: ${req.postData() || ''}`));
      req.continue();
    });
    page.on('response', async resp => {
      let content = '';
      try {
        content = await resp.json();
      } catch (e) {
        content = await resp.text();
      }
      console.log(chalk.blue(`resp:
                    url: ${resp.url()}
                    header: ${JSON.stringify(resp.headers())}
                    content: ${content}`));
    });
  },

  async close(clearAll = false) {
    // 保留最近的 3 个下次清理
    // const holdCnt = clearAll ? 0 : 3
    // for(let i = 0; i < browserPool.length - holdCnt; i++) {
    //   const browser = browserPool[i];
    //   if (browser !== null) {
    //     await browser.close();
    //   }
    // }
  }
};
