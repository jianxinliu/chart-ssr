LOG_PATH=./logs/info.log
APP_NAME=./ChartRenderApp.js

# stop process
tpid=`ps -ef|grep $APP_NAME|grep -v grep|grep -v kill|awk '{print $2}'`
if [ ${tpid} ]; then
    echo 'Stop Process...'
    kill -15 $tpid
fi
sleep 5

tpid=`ps -ef|grep $APP_NAME|grep -v grep|grep -v kill|awk '{print $2}'`
if [ ${tpid} ]; then
    echo 'Kill Process!'
    kill -9 $tpid
else
    echo 'Stop Success!'
fi

# backup log file
backName=backLog_`date +"%Y%m%d%H%M%S"`.tar.gz
tar -zcf $backName $LOG_PATH
mv $backName ./logBack/
echo log file back: $backName


# start process
tpid=`ps -ef|grep $APP_NAME|grep -v grep|grep -v kill|awk '{print $2}'`
if [ ${tpid} ]; then
    echo 'App is already running.'
else
    echo 'App is NOT running.'
    nohup node $APP_NAME > $LOG_PATH &
    echo 'Start Success!'
fi