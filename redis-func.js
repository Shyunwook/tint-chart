let moment = require('moment');
let request = require('request');
const FUNC = require('./common.js')();

module.exports = () => {
  return {
    setPeriodList : (term) => {
      let ninetyday = moment().add(-(Number(term)),'days').format("YYYY-MM-DD");
      let period_list = [];
      for(let i = 0; i < 6; i ++){
        let dateFrom = moment(ninetyday).add((i*15),'days').format("YYYY-MM-DD");
        let dateTo = moment(ninetyday).add((i*15+14),'days').format("YYYY-MM-DD");
        period_list.push({dateFrom:dateFrom,dateTo:dateTo});
      }
      return period_list;
    },
    loadDataToRedis : (period_list,cacheClient, res) => {
      let promise = [];
      for(let i = 0; i< period_list.length; i++){
        let temp = new Promise((resolve, reject) => {
          FUNC.getDynamoData(period_list[i]).then((data) => {
            for(let i = 0; i < data.length; i ++){
              let key = (data[i].date).split('-')[0] + (data[i].date).split('-')[1]
              cacheClient.hset(`${key}:${data[i].date}`, i, JSON.stringify(data[i]));
              cacheClient.sadd('dateList',data[i].date);
            }
            resolve(true);
          });
        });
        promise.push(temp);
      }
      Promise.all(promise).then((val) => {
        if(res){
          res.send(true);
        }else{
          return ;
        }
      })
    },
  }
}
