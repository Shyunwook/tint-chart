process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

let express = require('express');
let path = require('path');
let engine = require('ejs-locals');
let app = express();
let bodyParser = require('body-parser');
let moment = require('moment');
let cron = require('node-cron');
let request = require('request');

let redis = require('redis');
let cacheClient = redis.createClient(6379,'172.31.29.112');
// let cacheClient = redis.createClient(6379,'127.0.0.1');

const FUNC = require('./func.js')();

const wrap = asyncFn => {
// FIXME: Promise와 catch를 이용하면 더 간결해질 것 같습니다.
  return (async (req, res, next) => {
    try {
      return await asyncFn(req, res, next)
    } catch (error) {
      return next(error)
    }
  })
}

app.engine('ejs',engine);
app.set('views',path.join(__dirname,'views'));
app.set('view engine','ejs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));


app.get('/',(req, res) => {
  res.render('index.ejs',{result : "", other_grouped_weight_data : "", gs_grouped_weight_data : ""});
});

app.get('/getData',(req, res) => {
  let period = {dateFrom : "2019-02-12", dateTo : "2019-02-12"};
  FUNC.getDynamoData(period).then((data) => {
    // res.send({result : data.result, other_grouped_weight_data : data.other_grouped_weight_data, gs_grouped_weight_data : data.gs_grouped_weight_data});
  }, (error) => {
    res.render('error.ejs');
  });
});

app.post('/getRedisData', wrap(async(req, res) => {
  let period = {dateFrom : req.body.dateFrom, dateTo : req.body.dateTo};
  // let period = {dateFrom : '2018-11-13', dateTo : '2018-11-16'};
  let raw = {};
  let initial_day = "";

  let flag = await (() => {
    return new Promise((resolve, reject) => {
      cacheClient.sort("dateList","alpha",(err,result) => {
        initial_day = result[0];
        if(result.indexOf(period.dateFrom) > 0){
          resolve(true);
        }else{
          resolve(false);
        }
      })
    })
  })();

  if(flag){
    raw = await FUNC.getRedisData(period,cacheClient);
    console.log("Redis only!!");
  }else{
    let redis_period = { dateFrom : initial_day, dateTo : req.body.dateTo };
    let dynamo_period = { dateFrom : req.body.dateFrom, dateTo : moment(initial_day).add(-1,'days').format("YYYY-MM-DD")};

    let redis_raw = await FUNC.getRedisData(period,cacheClient);
    let dynamo_raw = await FUNC.getDynamoData(dynamo_period);

    // let redis_period = { dateFrom : initial_day, dateTo : '2018-11-16' };
    // let dynamo_period = { dateFrom : '2018-11-13', dateTo : moment(initial_day).add(-1,'days').format("YYYY-MM-DD")};

    raw = [...redis_raw, ...dynamo_raw];
    console.log("DynamoDB + Redis!!");
  }

  FUNC.setScheduleData(period,raw).then((result) => {
    res.send(result);
    // res.render('index.ejs',{result : JSON.stringify(result.result), other_grouped_weight_data : JSON.stringify(result.other_grouped_weight_data), gs_grouped_weight_data : JSON.stringify(result.gs_grouped_weight_data)});
    // res.send({result : result.result, other_grouped_weight_data : result.other_grouped_weight_data, gs_grouped_weight_data : result.gs_grouped_weight_data});
  });
}));




//Redis data handling API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/redis-load-data',(req, res) => {
  let period_list = FUNC.setPeriodList(90);
  FUNC.loadDataToRedis(period_list, cacheClient, res);
});

app.get('/flushall',(req, res) => {
  res.send(cacheClient.flushall());
});

cron.schedule('0 0 4 * * *',() => {
  let today = moment().add(0,'days').format("YYYY-MM-DD");
  let period = [{dateFrom : today, dateTo : today}];
  FUNC.loadDataToRedis(period, cacheClient);
})



app.listen('8081',function(){
  console.log('app listening on port 8081');
})
