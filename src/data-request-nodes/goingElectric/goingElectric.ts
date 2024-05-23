import axios, { AxiosResponse } from 'axios'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import {getRequest} from '../../requestUtils'

// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class GoingElectricNodeConfig  {
        constructor(public api_url: string, 
          public bbox: string, 
          public outfilePath: string,          
          public save_phenomenom: string,
          public key: string,
    
            ) { }
    }


    class GoingElectricNode extends AbstractNode {


        constructor(public config: GoingElectricNodeConfig) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done: any) {
          try{
            this.status(new NodeStatus("Requesting Data..."));

            let url: string = this.config.api_url
            let bbox : any = this.config.bbox.split(',')

            url += '?key='+this.config.key
            url += '&sw_lat='+bbox[0]+'&sw_lng='+bbox[1]+'&ne_lat='+bbox[2]+'&ne_lng='+bbox[3]
            url += '&exclude_faults=true&barrierfree=true'
    
            
            let res = await axios.get(url) as AxiosResponse

            if(res == undefined){
              throw "Download failed, response is undefined";
            }
           
            let data = res.data
            
            let geojson: any = {
              "type":"FeatureCollection",
              "features":[]
            }

            if(!("startkey" in data)){
              throw "goingElectric-Request: response structure changed, startkey no longer a key"
            }

            while('startkey' in data){
              
              if(!("chargelocations" in data) || !(data.chargelocations instanceof Array) ){
                throw "goingElectric-Request: response structure changed, chargelocations no longer a key or an array"
              }

              let numSkips: number = 0

              for(let chargeLocation of data.chargelocations){
                let bike:boolean = false
                let car:boolean = false
                let fast: boolean = false


                let currNumSkips:number = 0

                let addressKeys: Array<string> = ["street", "city", "postcode"]
                let addressKeysAvailable: Array<string> = []


                for(let key of addressKeys){
                  if("address" in chargeLocation && key in chargeLocation.address){
                    addressKeysAvailable.push(key)
                  }
                }

                let coordinateKeys: Array<string> = ["lat", "lng"]
                
                for(let key of coordinateKeys){
                  if(!(key in chargeLocation.coordinates)){
                    currNumSkips += 1
                  }
                  break
                }

                if(currNumSkips > 0){
                  numSkips += 1
                  continue
                }

                let feature:any = {
                  "type": "Feature",
       
                  "properties": {
                    source:"goingElectric"
                  },
                  "geometry": {
                    "type": "Point",
                    "coordinates": [parseFloat(chargeLocation.coordinates.lng), parseFloat(chargeLocation.coordinates.lat)]
                  }
                }

                if("url" in chargeLocation){
                  feature.properties.url = chargeLocation.url
                }
                if("name" in chargeLocation){
                  feature.properties.name = chargeLocation.name
                }

                for(let key of addressKeysAvailable){
                  feature.properties[key] = chargeLocation.address[key]

                }
                if(addressKeysAvailable.length == 3){
                  feature.properties.adresse = chargeLocation.address.street + ", " + chargeLocation.address.postcode + " " + chargeLocation.address.city

                }
                else{
                  throw "goingElectric-request: Response structure changed, adress-keys do no longer match"
                }

                let chargePoints: string = ""

                if(chargeLocation.network != undefined){
                  feature.properties.network = chargeLocation.network.toString()
                }
                else{
                  feature.properties.network = '-'
                }
                
                for(let chargePoint of chargeLocation.chargepoints){
                  
                  if(!("type" in chargePoint) || !("power" in chargePoint)){
                    continue
                  }

                  if(chargePoint.type.includes('Schuko')){
                    bike = true
                  }
                  if(chargePoint.power > 45){
                    car = false
                    fast = true
                  }
                  if(chargePoint.power < 45 && fast == false){
                    car=true
                  }

                  chargePoints += chargePoint.count.toString()+'x' + chargePoint.type + ' ' + chargePoint.power.toString()+'kw, '

                }

                if(chargePoints.length == 0){

                  numSkips += 1
                  continue

                }
                
                if(Object.keys(feature.properties).length < 3){

                  numSkips += 1
                  continue
                }

                feature.properties.Ladepunkte = chargePoints.slice(0, chargePoints.length-2)

                if(this.config.save_phenomenom != "all"){

                  if(this.config.save_phenomenom == 'bikes' && bike==true){
                    geojson.features.push(feature)
                  }
                  else if(this.config.save_phenomenom == 'cars' && car==true){
                    geojson.features.push(feature)
                  }
                  else if(this.config.save_phenomenom == 'fast_car' && fast==true){
                    geojson.features.push(feature)
                  }

                }
                else{
                    geojson.features.push(feature)
                }

              }

              if(data.chargelocations.length == numSkips){
                throw "goingElectric-request: Response structure change, keys are no longer matching"
                
              }

              let url_tmp = url + '&startkey=' + data.startkey

              data = await getRequest(this, msg, url_tmp)


            }

      
            msg.payload = JSON.parse(JSON.stringify(geojson))
            send(msg);

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

    RED.nodes.registerType("goingElectric", GoingElectricNode);
}
