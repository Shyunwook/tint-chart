let request = require('request');
let fs = require('fs');
let moment = require('moment');
let _ = require('lodash');

module.exports = () => {
  return {
    setScheduleData : (period,data) => {
      return new Promise((resolve, reject) => {
        (async () => {
          let weighted_data = getweightedRate(period, data);
          let dic = readBrandDictionary();
          let obj = {
            dic : await dic,
            weighted_data : await weighted_data
          }

          let grouped_weight_data =  await setGroupedData(obj);

          let result = {
            result : data,
            gs_grouped_weight_data : grouped_weight_data.gsshop,
            other_grouped_weight_data : grouped_weight_data.other
          }
          resolve(result);
        })();
      });
    },

    getRedisData : (period,cacheClient) => {
      return new Promise((resolve, reject) => {
        let start = moment(period.dateFrom);
        let end = moment(period.dateTo);

        let diff = moment(end).diff(moment(start),'days');
        let cursor = moment(start).format("YYYY-MM-DD");

        let result = [];
        let works = [];


        for(let i = 0; i <= diff; i ++){
          let key = moment(cursor).format("YYYYMM");
          works.push(getSpecificDateData(key,cursor,cacheClient,result));
          cursor = moment(cursor).add(1,'days').format('YYYY-MM-DD');
        }

        (async () => {
          await Promise.all(works).then(() => {
            resolve(result);
          })
        })();
      })
    },

    getDynamoData : (period) => {
      return new Promise((resolve, reject) => {
        let url = "https://fy2b0csnq7.execute-api.us-west-2.amazonaws.com/prod/vaccine-c-api";
        request({
          url : url,
          method : 'POST',
          body : period,
          json : true,
          encoding : null
        },(error, response, data) => {
          if(error){
            console.error(error);
            reject(Error('something is wrong -> getSchedule'));
          }else if(response.statusCode === 200){
            let result = JSON.stringify(data);
            console.log(result);
            resolve(data);
          }else{
            console.log(response.statusCode);
            reject(Error('wrong status code...'));
          }
        })
      })
    }
  };
};

function getSpecificDateData(key,cursor,cacheClient,result){
  return new Promise((resolve, reject) => {

    cacheClient.hgetall(`${key}:${cursor}`,(err,doc) => {
      for(key in doc){
        result.push(JSON.parse(doc[key]));
      }
      setTimeout(()=>{
        resolve(true);
      },3000)

    })
  })
}

function getweightedRate(period,schedule){
  return new Promise(async(resolve, reject) => {
    let startDt = setPreDay(period.dateFrom,1);
    startDt = startDt.replace(/-/gi,"");
    let endDt = period.dateTo.replace(/-/gi,"");

    let rate = await readS3weightedRate(startDt,endDt);
    let weighted_data = calculateWeight(schedule,rate);
    resolve(weighted_data);
  });
};

function readS3weightedRate(start,end){
  return new Promise((resolve, reject) => {
    let diff = moment(end).diff(start,'days');
    let work_list = [];

    for(let i = 0; i <= diff; i ++){
      console.log(i);
      let day = moment(start).add(i,'days').format("YYYYMMDD");
      console.log(day);
      let work = new Promise((resolve, reject) => {
        request({
          url : `https://s3.ap-northeast-2.amazonaws.com/tint-weight.innolab.us/${day}.json`,
          method : 'GET'
        },(error, response, data) => {
          if(error){
            console.error(error);
            reject(Error('something is wrong -> readS3weightedRate'));
          }else if(response.statusCode === 200){
            resolve(data);
          }else{
            rejecto(Error('wrong statusCode....'));
          }
        })
      })
      work_list.push(work);
    }

    Promise.all(work_list).then( ratio => {
      let result = {};
      for(let i = 0; i < ratio.length; i ++){
        result = Object.assign(result,JSON.parse(ratio[i]));
      }
      resolve(JSON.stringify(result));
    });
  });
}

function calculateWeight(schedule,rate){
  rate = JSON.parse(rate);

  schedule.forEach((item) => {
    let start = item.start_time.replace(":","");
    let end = item.end_time.replace(":","");
    let weighted_min, real_min;

    if(start > end){
      let date = moment(item.date).format('YYYYMMDD');
      let pre_date = moment(item.date).add(-1,'day').format('YYYYMMDD');

      weighted_min = calWeightMin(pre_date,start,"2359") + calWeightMin(date,"0000",end);

      pre_date = moment(pre_date).format('YYYY-MM-DD');
      real_min = calRealMin(item.start_time, item.end_time, item.date, pre_date);
    }else{
      let date = moment(item.date).format('YYYYMMDD');

      weighted_min = calWeightMin(date,start,end);
      real_min = calRealMin(item.start_time, item.end_time, item.date);
    }

    item.weighted_min = Number(weighted_min).toFixed(1);
    item.real_min = real_min;
  })

  function calWeightMin(date, start, end){
    // console.log(date);
    // console.log(rate);
    let weighted_min = rate[date].reduce((result,val) => {
      if(Object.keys(val)[0] >= start && Object.keys(val)[0] <= end){
        result += Number(val[ Object.keys(val)[0]]);
        return result;
      }
      return result;
    },0);
    return weighted_min;
  }

  function calRealMin(start, end, today, pre_day = today){
    let end_time = new Date(`${today} ${end}`);
    let start_time = new Date(`${pre_day} ${start}`);
    let diffMin = (end_time.getTime() - start_time.getTime())/(1000*60);
    return diffMin;
  }

  return schedule
}

function setPreDay(date,pre_day_flag){
  date = new Date(date);
  date.setDate(date.getDate() - pre_day_flag);

  let y = date.getFullYear();
  let m = '' + (date.getMonth() + 1);
  let d = '' + date.getDate();

  if(m.length < 2) m = '0' + m;
  if(d.length < 2) d = '0' + d;
  return `${y}-${m}-${d}`;
}

function setGroupedData(param){
  return new Promise((resolve, reject) => {
    let weighted_data = param.weighted_data;

    let grouped_weight_data = {
      other : [],
      gsshop : []
    };

    let data = weighted_data.reduce((result, value) => {
      let brand = getBrandName(value.item,param.dic);
      let obj = {
        name : value.item,
        img : value.thumbnail,
        shop : value.shop,
        brand : brand,
        count : 0,
        real_min : 0,
        weighted_min : 0,
        category : value.category,
        history : []
      }

      if(value.shop==='gsshop'||value.shop==='gsmyshop'){
        if(!result["gsshop"][value.item]){
          result['gsshop'][value.item] = obj;
          result['gsshop'][value.item].history.push(value);
        }
        sumData("gsshop",result,value);
      }else{
        if(!result["other"][value.item]){
          result['other'][value.item] = obj;
        }
        sumData("other",result,value);
      }
      return result;
    },{"gsshop" : {},"other":{}});

    for(key in data.gsshop){
      grouped_weight_data["gsshop"].push(data["gsshop"][key]);
    }

    for(key in data.other){
      grouped_weight_data["other"].push(data["other"][key]);
    }

    resolve(grouped_weight_data);
  })
};

function sumData(shop,result,value){
  let target = result[shop][value.item];
  target['weighted_min'] = (Number(target['weighted_min']) + Number(value.weighted_min)).toFixed(1);
  target['real_min'] = Number(target['real_min']) + Number(value.real_min);
  target['count'] ++;
  target['history'].push(value);
}

function getBrandName(item_name,dictionary){
  let brand_name_list = dictionary.split("\n");
  for(let i = 0; i < brand_name_list.length - 1; i ++){
    if(item_name.indexOf(brand_name_list[i]) !== -1){
      return brand_name_list[i];
    }
  }
  return "😥😥😥😥";
}

function readBrandDictionary(){
  return new Promise((resolve, reject) => {
    fs.readFile('brand-dictionary.txt', "utf8", (err, dic) => {
      if(err){
        reject("File read problem....");
      }else{
        resolve(dic);
      }
    })
  })
}
