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

const FUNC = require('./common.js')();
const REDIS = require('./redis-func.js')();

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
//
// app.get('/test',(req, res) => {
//   let period = {
//   "dateFrom": "2018-12-31",
//   "dateTo": "2018-12-31"
// };
//   return new Promise((resolve, reject) => {
//     let url = "https://fy2b0csnq7.execute-api.us-west-2.amazonaws.com/prod/vaccine-c-api";
//     request({
//       url : url,
//       method : 'POST',
//       body : period,
//       json : true,
//       encoding : null
//     },(error, response, data) => {
//       if(error){
//         console.error(error);
//         reject(Error('something is wrong -> getSchedule'));
//       }else if(response.statusCode === 200){
//         let result = JSON.stringify(data);
//         resolve(data);
//       }else{
//         console.log(response.statusCode);
//         reject(Error('wrong status code...'));
//       }
//     })
//   }).then((val) => {
//     console.log(val);
//   })
// })

app.post('/getScheduleData', wrap(async(req, res) => {
  let period = {dateFrom : req.body.dateFrom, dateTo : req.body.dateTo};
  let raw = {};
  let initial_day = "";

  let redis_data_flag = await (() => {
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

  if(redis_data_flag){
    raw = await FUNC.getRedisData(period,cacheClient);
    console.log("Redis only!!");
  }else{
    let redis_period = { dateFrom : initial_day, dateTo : req.body.dateTo };
    let dynamo_period = { dateFrom : req.body.dateFrom, dateTo : moment(initial_day).add(-1,'days').format("YYYY-MM-DD")};

    let redis_raw = await FUNC.getRedisData(period,cacheClient);
    let dynamo_raw = await FUNC.getDynamoData(dynamo_period);

    raw = [...redis_raw, ...dynamo_raw];
    console.log("DynamoDB + Redis!!");
  }

  FUNC.setScheduleData(period,raw).then((result) => {
    res.send(result);
  });
}));


cron.schedule('0 0 4 * * *',() => {
  let today = moment().add(0,'days').format("YYYY-MM-DD");
  let period = [{dateFrom : today, dateTo : today}];
  REDIS.loadDataToRedis(period, cacheClient);
})


app.listen('8081',function(){
  console.log('app listening on port 8081');
})



//Redis data handling API / 처음 레디스 데이터 세팅 API-----------------------------------------------------------------------------------------------
// app.get('/flushall',(req, res) => {
//   res.send(cacheClient.flushall());
// });

// app.get('/redis-load-data',(req, res) => {
//   let period_list = REDIS.setPeriodList(90);
//   REDIS.loadDataToRedis(period_list, cacheClient, res);
// });
