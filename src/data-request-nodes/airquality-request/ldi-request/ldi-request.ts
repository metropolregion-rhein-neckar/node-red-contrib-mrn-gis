import { rhumbDistance } from '@turf/turf';
import axios, { AxiosResponse } from 'axios'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class LuftDatenInfoRequestNodeConfig  {
        constructor(public api_url: string, 
          public bbox: string, 
          public outfilePath: string,          
          public save_phenomenom: string,
          public old_outfile: boolean 
    
            ) { }
    }


    class LuftDatenInfoRequestNode extends AbstractNode {

        oldOutfile: string = "";

        constructor(public config: LuftDatenInfoRequestNodeConfig) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done: any) {

          try{
            this.status(new NodeStatus(""))


            let url: string = this.config.api_url+'box='+this.config.bbox
            
  
            this.status(new NodeStatus("Requesting Data..."));

              let res = await axios.get(url) as AxiosResponse
            
              if (res == undefined) {
                throw "Download failed, response is undefined";
              }
              

              let data = res.data;
              
              if(!(data instanceof Array)){
                throw "LDI-Response is not an array anymore, please check manually"
              }

              let geojson: any = {
                "type":"FeatureCollection",
                "features":[]
              }


              let numSkips:number = 0
              let newSensorValues: Array<string> = []

              for (let station of data){
                //################### start check response structure###################
                if(!("sensordatavalues" in station)){
                  throw "LDI-Response changed. Station has no key 'sensordatavalues'"
                } 

                if(!(station.sensordatavalues instanceof Array)){
                  throw "LDI-Response changed. station.sensordatavalues is not an array anymore"
                }

                if(!("timestamp" in station)){
                  numSkips += 1
                  continue
                }

                if(!("location" in station)){
                  numSkips += 1
                  continue
                }

                if(!("longitude" in station.location)|| !("latitude" in station.location)){
                  numSkips += 1
                  continue
                }

                if(station.location.longitude == "" && station.location.latitude == ""){
                  numSkips += 1
                  continue
                }

                if(!("sensor" in station)){
                  numSkips += 1
                  continue
                }

                if(!('id' in station.sensor)){
                  numSkips += 1
                  break
                }

                //################### end check response structure###################


                for (let sensor of station.sensordatavalues){


                  for(let sensor_value in sensor){


                    let feature: any = {
                        "type": "Feature",
        
                        "properties": {
                          "source":"LuftDatenInfo"
                        },
                        "geometry": {
                          "type": "Point",
                          "coordinates": [parseFloat(station.location.longitude), parseFloat(station.location.latitude)]
                        }
                      }

                      feature.properties['timestamp'] = station.timestamp
                      feature.properties['id'] = station.sensor.id

                      // check for new Sensor Value Keys
                      let knownSensorValues: Array<string> = ['P1', 'P2', 'temperature', 'humidity', 'pressure_at_sealevel', 
                                                            'id', 'value', 'value_type']
                      
                      if(!(knownSensorValues.includes(sensor_value))){

                        newSensorValues.push(sensor_value)

                      }

                      if(sensor[sensor_value] == this.config.save_phenomenom){
                        let outFieldName: string = this.config.save_phenomenom
                        let outUnit: string = "";
                        
                        if(outFieldName=='P1'){outFieldName='PM10'; outUnit='µg/m³'}
                        else if(outFieldName=='P2'){outFieldName='PM2_5'; outUnit='µg/m³'}
                        else if(outFieldName=='temperature'){ outUnit='°C'}
                        else if(outFieldName=='humidity'){outUnit='%'}
                        else if(outFieldName=='pressure_at_sealevel'){outUnit='Pa'}
                        else {
                          // should never go here, just in case
                          continue

                        }
                        
                        feature.properties[outFieldName] = parseFloat(sensor.value);
                        feature.properties['unit'] = outUnit
                        geojson.features.push(feature)

                      }
                  }
                }
              }
            
            if(numSkips == data.length){
              throw "ldi-request: keys no longer match, please check"
  
            }

            if(newSensorValues.length != 0){
              throw "ldi-request: new sensor values available, check manually"
            }
            
            if(geojson.features.length == 0){
              throw "ldi-request: no features in geojson sensor values probably changed."
            }

            msg.payload = JSON.parse(JSON.stringify(geojson))
            
            send(msg)
          
            let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
            this.status(info);
    
            done();
          }catch(e){
            done(e);
            console.log(e);
            let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
            this.status(info);
          }
            
        }
    }

    RED.nodes.registerType("ldi-request", LuftDatenInfoRequestNode);
}
