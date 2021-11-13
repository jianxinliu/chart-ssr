const express = require('express');
const chalk = require('chalk');
const Log = require('./Log');
const app = express();
app.use(express.json());

const config = require('./config');
const { edaAppPath, port, urlWithHash } = config;

const render = require('./Render');
const { renderState, emptyResult } = require('./Constants')

// Render server heleath check
app.get('/ping', function (_, resp) {
  resp.send('PONG');
});

app.get('/close', async function (_, resp) {
  await render.close(true);
  resp.send('closed');
})

/**
 * 客户端确认收到渲染结果后，主动删除
 * GET params: uid, force
 */
app.get('/ack', function (req, resp) {
  const {uid, force} = req.query
  if (!uid) {
    badRequest(resp, 'need uid')
    return;
  }
  Log.info("force: ", force, force === 'false')
  const isForce = JSON.parse(force)
  const success = render.removeTaskResult(uid, isForce)
  resp.send(success)
})

/**
 * 客户端询问某次渲染是否完成
 * GET params: uid
 */
app.get('/checkRender', function (req, resp) {
  const {uid} = req.query
  if (!uid) {
    badRequest(resp, 'need uid')
    return;
  }
  const ret = render.checkRenderResult(uid)
  if (renderState.isError(ret.state)) {
    resp.send(ret);
    return;
  }

  if (renderState.isDone(ret.state)) {
    const result = ret.result
    Log.info(uid + ' render done, send back: ret: ', result.length, '，info: ',
      result.map(v => `name:${v.chartName || '-'}, size: ${v.hasOwnProperty('base64List') ? v.base64List.length : -1}`).join(';'))
  }
  resp.send(ret);
})

/**
 * 异步渲染，请求后直接返回 uid
 */
app.post('/renderAsync', async function (req, resp) {
  Log.info('renderAsync start at:', new Date());
  const body = req.body;
  if (!body) {
    badRequest(resp, 'use request body please!')
    return;
  }
  let { parentId, elementId, chartId, evtUser } = body;
  const uid = String(new Date().getTime())

  Log.info('req: ', JSON.stringify(body), 'uid is:', uid);
  let params = [
    'parentId=' + parentId,
    'elementId=' + elementId,
    'widgetName=Charts',
    'chartId=' + chartId
  ];

  const url = edaAppPath + `${urlWithHash ? '/#' : ''}/charts?${params.join('&')}`;
  Log.info(url);
  let ret = uid;
  try {
    render.renderAsync(edaAppPath + '/#/', url, evtUser.replace(/_/, ''), uid);
  } catch (e) {
    Log.error(uid + ' render error:', e);
    resp.send('');
    return;
  } finally {
    Log.info(uid + ' render done at:', new Date());
  }
  resp.send(ret);
});

app.post('/render', async function (req, resp) {
  Log.info('render start at:', new Date());
  const body = req.body;
  if (!body) {
    resp.status(400);
    resp.send("Bad Request: use request body please!");
    return;
  }
  let { parentId, elementId, chartId, evtUser } = body;
  const uid = new Date().getTime()

  Log.info('req: ', JSON.stringify(body), 'uid is:', uid);
  let params = [
    'parentId=' + parentId,
    'elementId=' + elementId,
    'widgetName=Charts',
    'chartId=' + chartId
  ];

  const url = edaAppPath + `${urlWithHash ? '/#' : ''}/charts?${params.join('&')}`;
  Log.info(url);
  let ret = [];
  try {
    ret = await render.go(edaAppPath + '/#/', url, evtUser.replace(/_/, ''), uid);
  } catch (e) {
    Log.error(uid + ' render error:', e);
    resp.send([]);
    return;
  } finally {
    Log.info(uid + ' render done at:', new Date());
  }
  Log.info(uid + ' render done, send back: ret: ', ret.length, '，info: ',
      ret.map(v => `name:${v.chartName || '-'}, size: ${v.hasOwnProperty('base64List') ? v.base64List.length : -1}`).join(';'))
  resp.send(ret);
});

; (async () => {
  app.listen(port);
  console.log(chalk.blueBright.bold('Chart Render Server listening on '),
      chalk.red.bold(port));
})().catch(async e => {
  await render.close(true);
  console.log(e);
});


function badRequest(response, msg) {
  response.status(400);
  response.send("Bad Request: " + msg);
}