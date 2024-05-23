import * as fs from 'fs'
import axios, { AxiosResponse } from 'axios'
import * as FormData from 'form-data'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'


// TODO 1: refactor this code
module.exports = function (RED: any) {

  class OSMMonitoringNodeConfig {
    constructor(
      public outfilePath: string,
      public time: string,
      public filter1: string,
      public filter2: string,
      public save_phenomenom: string,
      public bpoly: string,
      public region: boolean,
      public capita_prop: string
    ) { }
  }


  class OSMMonitoringNode extends AbstractNode {

    oldOutfile: string = "";

    constructor(public config: OSMMonitoringNodeConfig) {
      super(config, RED)


      this.on('input', this.onInput);
    }

    //TO DO: ADD Polygon support, modify node-html for request modes
    async onInput(msg: any, send: any) {
      this.status(new NodeStatus(""))
      let url_ohsome: string = "https://api.ohsome.org/"

      let bpoly_raw: any = fs.readFileSync(this.config.bpoly, 'utf8');
      let bpoly_parsed: any = JSON.parse(bpoly_raw)


      let chart_data: any = {
        "series": [],
        "data": [],
        "labels": []
      }


      if (this.config.save_phenomenom == 'feature_count_date') {

        // , is and. 
        let filters: any = this.config.filter1.split(',')
        url_ohsome = url_ohsome + "v1/elements/count"


        for (let f of filters) {


          let data = await this.postDownload(url_ohsome, bpoly_raw, f)

          chart_data.series.push(f);

          let values: any = [data.result[0].value]

          chart_data.data.push(values)


        }
      }

      if (this.config.save_phenomenom == 'feature_count_time') {

        let filters: any = this.config.filter1.split(',')
        url_ohsome = url_ohsome + "v1/elements/count"


        for (let f of filters) {

          let data = await this.postDownload(url_ohsome, bpoly_raw, f)

          chart_data.series.push(f);

          let values: any = []

          for (let month of data.result) {

            let value: any = {
              "x": new Date(month.timestamp).valueOf(),
              "y": month.value
            }

            values.push(value)
          }

          chart_data.data.push(values)
        }
      }


      if (this.config.save_phenomenom == 'feature_emptiness_date') {


        let filter2s: any = this.config.filter2.split(',')
        url_ohsome = url_ohsome + "v1/elements/count/ratio"

        let values: any = []

        chart_data.series[0] = 'Share of features with value'


        for (let f of filter2s) {

          let data = await this.postDownload(url_ohsome, bpoly_raw, this.config.filter1, f)

          chart_data.labels.push(f)

          values.push(1 - data.ratioResult[0].ratio)

          //values[chart_data.series.indexOf(f)].push(data.ratioResult[0].ratio)

        }

        chart_data.data.push(values)

      }


      if (this.config.save_phenomenom == 'feature_emptiness_time') {

        let filter2s: any = this.config.filter2.split(',')
        url_ohsome = url_ohsome + "v1/elements/count/ratio"


        for (let f of filter2s) {


          let data = await this.postDownload(url_ohsome, bpoly_raw, this.config.filter1, f)


          let values: any = []
          chart_data.series.push(this.config.filter1 + " " + f);

          for (let month of data.ratioResult) {

            let value: any = {
              "x": new Date(month.timestamp).valueOf(),
              "y": 1 - month.ratio
            }

            values.push(value)
          }

          chart_data.data.push(values)
        }

      }

      if (this.config.save_phenomenom == 'user_count_time') {

        url_ohsome = url_ohsome + "v1/users/count"
        chart_data.labels.push('OSM-users')


        if (this.config.region) {

          let filters = this.config.filter1.split(',')

          for (let feature of bpoly_parsed.features) {

            chart_data.series.push(feature.properties['GEN'])

            let featureCollection: any = {
              "type": "FeatureCollection",
              "features": [feature]
            }

            let bpoly: string = JSON.stringify(featureCollection)

            let values: any = []

            for (let f of filters) {
              let data = await this.postDownload(url_ohsome, bpoly, f)

              for (let month in data.result) {
                let value: any = {
                }

                if (values[month] != undefined) {

                  value = values[month]

                  if (this.config.capita_prop != "") {
                    value.y = data.result[month].value * 10000 / feature.properties[this.config.capita_prop]
                  }
                  else {
                    value.y += data.result[month].value
                  }

                }
                else {
                  value['x'] = new Date(data.result[month].fromTimestamp).valueOf()

                  if (this.config.capita_prop != "") {
                    value['y'] = data.result[month].value * 10000 / feature.properties[this.config.capita_prop]
                  }
                  else {
                    value['y'] = data.result[month].value
                  }


                  values.push(value)
                }
              }
            }

            chart_data.data.push(values)
          }

        }

      }

      if (this.config.save_phenomenom == 'user_count_date') {
        // get label
        url_ohsome = url_ohsome + "v1/users/count"

        let date: any = this.config.time.split('/')[0]
        let date1 = new Date(date)

        chart_data.labels.push('OSM-user ' + (date1.getMonth() + 1).toString() + '-' + date1.getFullYear().toString())

        if (this.config.region) {
          let filters = this.config.filter1.split(',')



          for (let feature of bpoly_parsed.features) {
            let values: any = []
            chart_data.series.push(feature.properties['GEN'])

            let featureCollection: any = {
              "type": "FeatureCollection",
              "features": [feature]
            }

            let bpoly: string = JSON.stringify(featureCollection)



            for (let f of filters) {
              let data = await this.postDownload(url_ohsome, bpoly, f)



              if (values[0] != undefined) {
                // calc users per 10.000 inhabitants
                if (this.config.capita_prop != "") {

                  values[0] = data.result[0].value * 10000 / feature.properties[this.config.capita_prop] + values[0]
                }
                // else normal user count
                else {
                  values[0] = data.result[0].value + values[0]
                }
              }

              else {
                if (this.config.capita_prop != "") {

                  values.push(data.result[0].value * 10000 / feature.properties[this.config.capita_prop])

                }
                else {
                  values.push(data.result[0].value)
                }
              }


            }

            chart_data.data.push(values)
          }
        }

      }


      msg.payload = [chart_data];

      this.send(msg)

      this.status(new NodeStatus("MSG successfully sent"))


    }


    async postDownload(baseUrl: string, bpoly: any, filter1: string = "", filter2: string = "") {
      this.status(new NodeStatus("Downloading from Ohsome", Fill.green, Shape.ring))

      let formData = new FormData()


      formData.append("bpolys", bpoly)
      formData.append("time", this.config.time)
      formData.append("format", "json")

      if (filter2 != "") {
        formData.append("filter2", filter2)
      }
      if (filter1 != "") {
        formData.append("filter", filter1)
      }

      let headers = formData.getHeaders()

      let res = await axios.post(baseUrl, formData, { headers: headers }

      ).catch((error) => {
        this.status(new NodeStatus("Ohsome download failed", Fill.red, Shape.dot))

        console.log(error)

      }) as AxiosResponse
      this.status(new NodeStatus("Downloading from Ohsome", Fill.green, Shape.ring))

      formData = new FormData()

      return await res.data

    }

    async download(url: string, msg: any) {
      // download data
      this.status(new NodeStatus("Downloading from Ohsome", Fill.green, Shape.ring))

      let res = await axios.get(url).catch((error) => {
        this.status(new NodeStatus("Ohsome download failed", Fill.red, Shape.dot))

        this.error(error, msg)

      }) as AxiosResponse

      if (res == undefined) {
        this.status(new NodeStatus("Ohsome download failed", Fill.red, Shape.dot))

        return
      }

      this.status(new NodeStatus("Ohsome download successfull", Fill.green, Shape.dot))


      let data = await res.data;

      return data;
    }
  }

  RED.nodes.registerType("osm-monitoring", OSMMonitoringNode);
}
