let request = require('request');
let fs = require('fs');
let moment = require('moment');

module.exports = () => {
  return {
    readWeightJson : (period, res) => {
      console.log(period);
    },
    setScheduleData : (period,data) => {
      return new Promise((resolve, reject) => {
        getweightedRate(period,data)
        .then(readBrandDictionary)
        .then(setGroupedData)
        .then((grouped_weight_data) => {
          let obj = {
            result : data,
            gs_grouped_weight_data : grouped_weight_data.gsshop,
            other_grouped_weight_data : grouped_weight_data.other
          }
          resolve(obj);
        });
        // getweightedRate(period,data).then((rate) => {
        //   resolve(rate);
        // })
      })
    },
    getRedisData : (period,cacheClient) => {
      return new Promise((resolve, reject) => {
        let start = moment(period.dateFrom);
        let end = moment(period.dateTo);

        let diff = moment(end).diff(moment(start),'days');
        let cursor = moment(start).format("YYYY-MM-DD");

        let result = [];

        (async() => {
          for(let i = 0; i <= diff; i ++){
            let key = moment(cursor).format("YYYYMM");
            await getSpecificDateData(key,cursor,cacheClient,result);
            cursor = moment(cursor).add(1,'days').format('YYYY-MM-DD');
          }
          resolve(result);
        })();
      })
    },
    loadDataToRedis : (period_list,cacheClient, res) => {
      let promise = [];
      for(let i = 0; i< period_list.length; i++){
        let temp = new Promise((resolve, reject) => {
          getDynamoData(period_list[i]).then((data) => {
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
            resolve(data);
          }else{
            console.log(response.statusCode);
            reject(Error('wrong status code...'));
          }
        })
      })
    },
    // getDynamoData : (period) => {
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
    //   })
    // },
    //
    // getSchedule : (period) => {
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
    //
    //         getweightedRate(period,result)
    //         .then(readBrandDictionary)
    //         .then(setGroupedData)
    //         .then((grouped_weight_data) => {
    //           let obj = {
    //             result : result,
    //             gs_grouped_weight_data : grouped_weight_data.gsshop,
    //             other_grouped_weight_data : grouped_weight_data.other
    //           }
    //           resolve(obj);
    //         })
    //
    //
    //       }else{
    //         console.log(response.statusCode);
    //         reject(Error('wrong status code...'));
    //       }
    //     })
    //   })
    // },
  };
};

function getSpecificDateData(key,cursor,cacheClient,result){
  return new Promise((resolve, reject) => {
    cacheClient.hgetall(`${key}:${cursor}`,(err,doc) => {
      for(key in doc){
        result.push(JSON.parse(doc[key]));
      }
      resolve(true);
    })
  })
}

function getDynamoData(period){
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
        resolve(data);
      }else{
        console.log(response.statusCode);
        reject(Error('wrong status code...'));
      }
    })
  })
}

// function getweightedRate(period,schedule){
//   return new Promise((resolve, reject) => {
//     let startDt = getScheduleDate(period.dateFrom,1);
//     startDt = startDt.replace(/-/gi,"");
//     let endDt = period.dateTo.replace(/-/gi,"");
//     request({
//       url : `http://data.gshs.co.kr/jsonProvider/broad/appliedWeightedMinute/day.do?startDt=${startDt}&endDt=${endDt}&media=C`,
//       method : 'GET',
//     },(error, response, data) => {
//       if(error){
//         reject(Error('something is wrong -> getweightedRate'));
//       }else if(response.statusCode == 200){
//         // let weighted_data = JSON.stringify(calculateWeight(schedule,data));
//         let weighted_data = calculateWeight(schedule,data);
//         resolve(weighted_data);
//       }else{
//         reject(Error('wrong status code...'));
//       }
//     });
//   });
// }

function getweightedRate(period,schedule){
  return new Promise(async(resolve, reject) => {
    let startDt = getScheduleDate(period.dateFrom,1);
    startDt = startDt.replace(/-/gi,"");
    let endDt = period.dateTo.replace(/-/gi,"");

    let rate = await readS3weightedRate(startDt,endDt);
    // resolve(rate);
    let weighted_data = calculateWeight(schedule,rate);
    resolve(weighted_data);
  });
};

function readS3weightedRate(start,end){
  return new Promise((resolve, reject) => {
    let diff = moment(end).diff(start,'days');
    let work_list = [];

    for(let i = 0; i <= diff; i ++){
      let day = moment(start).add(i,'days').format("YYYYMMDD");
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
      // console.log(result['20190202']);
      resolve(JSON.stringify(result));
    });
  });
}

function weightFileRead(title){
  return new Promise((resolve, reject) => {
    fs.readFile(title,'utf8', (err,data) => {
      if(err){
        reject();
      }
      resolve(JSON.parse(data));
    })
  })
}

function calculateWeight(schedule,rate){
  rate = JSON.parse(rate);

  function CreateItem(data){
    this.weighted_min = 0;
    let today = getScheduleDate(data.date,0);
    let pre_day = getScheduleDate(data.date,1);

    if(data.end_time < data.start_time){
      this.pre_start = data.start_time.replace(":","");
      this.pre_end = "2359";
      this.start = "0000";
      this.end = data.end_time.replace(":","");

      let end_time = new Date(`${today} ${data.end_time}`);
      let start_time = new Date(`${pre_day} ${data.start_time}`);
      let diffMin = (end_time.getTime() - start_time.getTime())/(1000*60);

      this.real_min = diffMin;
    }else{
      this.start = data.start_time.replace(":","");
      this.end = data.end_time.replace(":","");

      let end_time = new Date(`${today} ${data.end_time}`);
      let start_time = new Date(`${today} ${data.start_time}`);
      let diffMin = (end_time.getTime() - start_time.getTime())/(1000*60);

      this.real_min = diffMin;
    }

    this.weightedMin = () => {
      if(!this.pre_start){
        let start_idx = minute_list.indexOf(this.start);
        let end_idx = minute_list.indexOf(this.end);

        return getItemWeightedMin(start_idx, end_idx, today.replace(/-/gi,""));
      }else{
        let pre_start_idx = minute_list.indexOf(this.pre_start);
        let pre_end_idx = minute_list.indexOf(this.pre_end);

        let start_idx = minute_list.indexOf(this.start);
        let end_idx = minute_list.indexOf(this.end);

        return getItemWeightedMin(pre_start_idx, pre_end_idx, pre_day.replace(/-/gi,"")) + getItemWeightedMin(start_idx, end_idx, today.replace(/-/gi,""));
      }
    }
  }

  let some_day = schedule[0].date.replace(/-/gi,"");
  let minute_list = rate[some_day].map((e) => {
    for(key in e){
      return key;
    }
  });

  CreateItem.prototype.minute_list = minute_list;


  function getItemWeightedMin(s_idx,e_idx,date){
    let w_min = 0;
    // console.log(rate['20190202']);
    for(let i = s_idx; i <= e_idx; i++){
      for(key in rate[date][i]){
        // console.log(key);
        w_min += Number(rate[date][i][key]);
      }
    }
    return w_min;
  }

  schedule.forEach((data) => {
    let item = new CreateItem(data);
    data.weighted_min = Number(item.weightedMin()).toFixed(1);
    data.real_min = item.real_min;
  })

  return schedule
}

function getScheduleDate(date,pre_day_flag){
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
    // weighted_data = JSON.parse(weighted_data);

    let grouped_weight_data = {
      other : [],
      gsshop : []
    };
    let other_item_index_obj = {};
    let other_grouped_data_idx = 0;

    let gs_item_index_obj = {};
    let gs_grouped_data_idx = 0;

    weighted_data.forEach((data) => {
      if(data.shop==="gsshop"){
        if(data.item in gs_item_index_obj){
          let gs_index = gs_item_index_obj[data.item];

          grouped_weight_data["gsshop"][gs_index].weighted_min = Number(grouped_weight_data["gsshop"][gs_index].weighted_min);
          grouped_weight_data["gsshop"][gs_index].weighted_min += Number(data.weighted_min);
          grouped_weight_data["gsshop"][gs_index].weighted_min = Number(grouped_weight_data["gsshop"][gs_index].weighted_min).toFixed(1);

          grouped_weight_data["gsshop"][gs_index].real_min =  Number(grouped_weight_data["gsshop"][gs_index].real_min) + Number(data.real_min);
          grouped_weight_data["gsshop"][gs_index].count ++;
          // }else if(data.shop==="hmall"||data.shop==="cjmall"||data.shop==="lottemall"||data.shop==="gsshop"){
        }else{

          gs_item_index_obj[data.item] = gs_grouped_data_idx;
          gs_grouped_data_idx ++ ;
          let brand = getBrandName(data.item,param.dic);
          let temp = {
            name : data.item,
            img : data.thumbnail,
            shop : data.shop,
            brand : brand,
            count : 1,
            real_min : data.real_min,
            weighted_min : data.weighted_min,
            category : data.category
          }
          grouped_weight_data["gsshop"].push(temp);
        }
      }else{
        // if(data.shop==="hmall"||data.shop==="cjmall"||data.shop==="lottemall"||data.shop==="gsshop"){
          if(data.item in other_item_index_obj){
            let other_index = other_item_index_obj[data.item];

            grouped_weight_data["other"][other_index].weighted_min = Number(grouped_weight_data["other"][other_index].weighted_min);
            grouped_weight_data["other"][other_index].weighted_min += Number(data.weighted_min);
            grouped_weight_data["other"][other_index].weighted_min = Number(grouped_weight_data["other"][other_index].weighted_min).toFixed(1);

            grouped_weight_data["other"][other_index].real_min =  Number(grouped_weight_data["other"][other_index].real_min) + Number(data.real_min);
            grouped_weight_data["other"][other_index].count ++;
            // }else if(data.shop==="hmall"||data.shop==="cjmall"||data.shop==="lottemall"||data.shop==="gsshop"){
          }else{

            other_item_index_obj[data.item] = other_grouped_data_idx;
            other_grouped_data_idx ++ ;
            let brand = getBrandName(data.item,param.dic);
            let temp = {
              name : data.item,
              img : data.thumbnail,
              shop : data.shop,
              brand : brand,
              count : 1,
              real_min : data.real_min,
              weighted_min : data.weighted_min,
              category : data.category
            }
            grouped_weight_data["other"].push(temp);
          }
        // }
      }
    })
    resolve(grouped_weight_data);
  })
};

function getBrandName(item_name,dictionary){
  let brand_name_list = dictionary.split("\n");
  for(let i = 0; i < brand_name_list.length - 1; i ++){
    if(item_name.indexOf(brand_name_list[i]) !== -1){
      return brand_name_list[i];
    }
  }
  return "😥😥😥😥";
}

function readBrandDictionary(weighted_data){
  return new Promise((resolve, reject) => {
    fs.readFile('brand-dictionary.txt', "utf8", (err, dic) => {
      if(err){
        reject("File read problem....");
      }else{
        let param = {
          dic : dic,
          weighted_data : weighted_data
        }
        resolve(param);
      }
    })
  })
}
