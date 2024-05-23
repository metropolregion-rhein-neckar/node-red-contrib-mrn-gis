import axios, { AxiosResponse } from 'axios'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import * as moment from 'moment'



// Out: GeoJSON object as payload

module.exports = function (RED: any) {

  class OpenSenseMapRequestNodeConfig  {
    constructor(public api_url: string,
      public timestamp: string,
      public format: string,
      public bbox: string,
      public save_phenomenom: string,
      public filter_ldi: boolean
    ) { }
  }

  class OpenSenseMapRequestNode extends AbstractNode {

    oldOutfile: string = "";


    constructor(public config: OpenSenseMapRequestNodeConfig) {
      super(config, RED)

      this.on('input', this.onInput);
    }


    async onInput(msg: any, send: any, done: any) {
      try{
      let newSensorValues: Array<string> = []

      this.status(new NodeStatus("Requesting Data..."));

      let geojson: any = {
        "type": "FeatureCollection",
        "features": []
      }


      if (this.config.timestamp == "") {
        let now = moment()

        let date_start = now.toISOString()

        this.config.timestamp = date_start.substring(0, 19) + 'Z'
      }


      let api_url: string = this.config.api_url + '?date=' + this.config.timestamp + '&format=geojson&bbox=' + this.config.bbox

      let res = await axios.get(api_url) as AxiosResponse;

      if (res == undefined) {
        throw "OpenSenseMap download failed."
      }

      let data: any = res.data;

      if(typeof data !== 'object'){
        throw "OpenSense-Response is not a GeoJSON-Featurecollection, please check"
      }
      // add source to data
      if(!(data.hasOwnProperty("features"))){
        throw "OpenSense-Response is not a GeoJSON-Featurecollection, please check"
      }


      for (let feature of data.features) {
        
        if(!(feature.properties.hasOwnProperty("sensors"))){
          throw "OpsenSense-Response structure changed, sensors no longer in properties"
        }

        if(!(feature.properties.sensors instanceof Array)){
          throw "OpsenSense-Response structure changed, sensors no longer an array"
        }

        for (let property of feature.properties.sensors) {
          //filter for luftdateninfo-sensor
          if (feature.properties.model.includes('luftdaten_sds011') && this.config.filter_ldi == true) {
            continue
          }
            let sensor_feature: any = {
              "type": "Feature",

              "properties": {
                "source": "OpenSenseMap"
              },
              "geometry": {
                "type": "Point",
                "coordinates": [parseFloat(feature.geometry.coordinates[0]), parseFloat(feature.geometry.coordinates[1])]
              }
            }
            // TODO 2: work around!
            if(!(property.hasOwnProperty("lastMeasurement")) || property.lastMeasurement == null){
              continue
              throw "opensense-request: Station has no key timestamp/value object, please check"
            }
            if(!(property.lastMeasurement.hasOwnProperty('value'))){
              throw "opensense-request: station has no value, please check"
            }
            if(!(property.lastMeasurement.hasOwnProperty('createdAt'))){
              throw "opensense-request: station has no timestamp, please check"
            }
            if(!(feature.properties.hasOwnProperty("_id"))){
              throw "opensense-request: Station has no id timestamp, please check"
            }

            if(!(property.hasOwnProperty("title"))){
              throw "opensense-request: title no longer a key, please check"
            }

            sensor_feature.properties['id'] = feature.properties._id

            // TO DO: Way to many values for this to work. 
            // let knownSensorValues: Array<string> = ['PM10','PM2_5', 'temperature', 'humidity', 'pressure_at_sealevel']
                      
            // if(!(knownSensorValues.includes(property.title))){

            //   newSensorValues.push(property.title)

            // }

            if (property.title == this.config.save_phenomenom) {

              sensor_feature.properties[this.config.save_phenomenom] = parseFloat(property.lastMeasurement.value);
              sensor_feature.properties.unit = property.unit;
              sensor_feature.properties['timestamp'] = property.lastMeasurement.createdAt

              geojson.features.push(sensor_feature)
              
            }
        }
      }

      if(newSensorValues.length != 0){
        throw "opensense-request: new sensor values available, check manually"
      }
      

      msg.payload = JSON.parse(JSON.stringify(geojson))

      send(msg)
      let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
      this.status(info);

      done();
    }catch(e){

      console.log(e);
      let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
      this.status(info);

    }
    }


  }

  RED.nodes.registerType("opensense-request", OpenSenseMapRequestNode);
}
