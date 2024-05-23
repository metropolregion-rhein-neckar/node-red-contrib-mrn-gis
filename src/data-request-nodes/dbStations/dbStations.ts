import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import axios, { AxiosResponse } from 'axios'
import * as moment from 'moment';


// Out: GeoJSON object as payload
module.exports = function (RED: any) {

    class dbStationsNodeConfig  {
        constructor(public api_url: string,
                    public api_key: string,
                    public api_id: string
            ) { }
    }


    class dbStationsNode extends AbstractNode {
     
        constructor(public config: dbStationsNodeConfig) {
            super(config, RED)          
        
            this.on('input', this.onInput);
        }

        async onInput(msg: any, send: any, done:any) {

            try{
            this.status(new NodeStatus("Requesting Data..."));

            let geoJSON = {"type": "FeatureCollection", "features": Array<any>()}

            let header = {
                headers: {
                    "DB-Api-Key": this.config.api_key,
                    "DB-Client-Id":this.config.api_id,
                    'accept': "application/json"
                }
              }


            let response = await axios.get(this.config.api_url, header) as AxiosResponse

            if(response == undefined){
                throw "Download failed, response is undefined"
            }



            let stations = response.data.result;

            if(!(stations instanceof Array)){

                throw "dbStations-Request: Response is no longer an Array"

            }

            let numSkips: number = 0

            for (let station of stations) {


                if(!("ril100Identifiers" in station) || !(station['ril100Identifiers'] instanceof Array)){
                    numSkips += 1
                    
                    continue
                }

                if(!("geographicCoordinates" in station['ril100Identifiers'][0]) || !(station['ril100Identifiers'][0]['geographicCoordinates']['coordinates'] instanceof Array) || station['ril100Identifiers'][0]['geographicCoordinates']['coordinates'].length < 2){
                    numSkips += 1
                    
                    continue
                }

                let lon = station["ril100Identifiers"][0]["geographicCoordinates"]["coordinates"][0]
                let lat = station["ril100Identifiers"][0]["geographicCoordinates"]["coordinates"][1]
   


                let properties:any = {};
                properties["Name"] = station["name"];

                let keys: Array <string> = ["hasBicycleParking", "hasCarRental", "hasDBLounge", "hasLocalPublicTransport", "hasLockerSystem",
                                            "hasLostAndFound", "hasMobilityService", "hasParking", "hasPublicFacilities", "hasParking",
                                            "hasPublicFacilities", "hasRailwayMission", "hasTaxiRank", "hasTravelCenter", "hasWiFi"]
                

                
                for(let key of keys){

                    if(!(key in station)){

                        throw `dbStation-Requests: Response structure changed ${key} no longer a key of station`
                    }

                }

                properties["Fahrradstellplätze"] = station["hasBicycleParking"].toString();
                properties["Autovermietung"] = station["hasCarRental"].toString();
                properties["DB Lounge"] = station["hasDBLounge"].toString();
                properties["ÖPNV"] = station["hasLocalPublicTransport"].toString();
                properties["Schließfächer"] = station["hasLockerSystem"].toString();
                properties["Fundbüro"] = station["hasLostAndFound"].toString();
                properties["Mobilitätsservice"] = station["hasMobilityService"].toString();
                properties["Parkplätze"] = station["hasParking"].toString();
                properties["Öffentliche Toilette"] = station["hasPublicFacilities"].toString();
                properties["Bahnhofsmission"] = station["hasRailwayMission"].toString();
                properties["Taxi-Stellplätze"] = station["hasTaxiRank"].toString();
                properties["Reisezentrum"] = station["hasTravelCenter"].toString();
                properties["WiFi"] = station["hasWiFi"].toString();


                let feature = {"type": "Feature",
                "properties": properties,
                "geometry": { 
                     "type": "Point",
                         "coordinates": [lon,
                                        lat]}};
                geoJSON['features'].push(feature);

            }
            
            if(numSkips == stations.length){

                throw "dbStations-Request: Response structure changed, please check"
            }


            msg.payload = JSON.parse(JSON.stringify(geoJSON))

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

    RED.nodes.registerType("dbStations", dbStationsNode);
}