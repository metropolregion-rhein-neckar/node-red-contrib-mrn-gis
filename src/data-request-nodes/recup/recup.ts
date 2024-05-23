
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import axios, { AxiosResponse } from 'axios'
import { off } from 'process'

// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class ReCupNodeConfig {
        constructor(public api_url: string,
            public outfilePath: string
        ) { }
    }

    class ReCupNode extends AbstractNode {

        constructor(public config: ReCupNodeConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }

        async onInput(msg: any, send: any, done:any) {
            try{
            this.status(new NodeStatus("Requesting Data..."));

            let geoJSON = { "type": "FeatureCollection", "features": Array<any>() }

            let response = await axios.get(this.config.api_url) as AxiosResponse

            if(response == undefined){
                throw "Download failed, response is undefined";
            }
            let recup = response.data;

            if(!(recup instanceof Array)){
                throw "Recup-request: Response structure changed, please check"
            }
            let propLength:number = 0

            for (let point of recup) {

                let properties: any = {};


                if("name" in point){
                    properties["Name"] = point.name;
                }
                if("street1" in point){
                    properties["Straße"] = point.street1;
                }

                if ("street2" in point && !(point.street2 == null || point.street2 == "")) {
                    properties["Straßenzusatz"] = point.street2;
                }
                if("zipcode" in point){
                    properties["PLZ"] = point.zipcode;
                }
                if("city" in point){
                    properties["Stadt"] = point.city;
                }

                if ("url" in point && !(point.url == null || point.url == "")) {
                    properties["URL"] = point.url;
                }
                if("type" in point){
                    properties["Typ"] = point.type;
                }

                if("coordinates" in point && point.coordinates instanceof Array && point.coordinates.length >=2){
                    let feature = {
                        "type": "Feature",
                        "properties": properties,
                        "geometry": {
                            "type": "Point",
                            "coordinates": [point.coordinates[1], point.coordinates[0]]
                        }
                    };
                    geoJSON['features'].push(feature);
                    propLength += Object.keys(feature.properties).length
                }
                
            }
            
            if(geoJSON.features.length == 0){
                throw "Recup-request: no features in geojson coordinate array probably changed."
                
            }

            if(propLength/geoJSON.features.length < 3){
                throw "Recup-request: average number of props is smaller than 3, keys probably changed, please check."
            }

            msg.payload = JSON.parse(JSON.stringify(geoJSON))
            
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

    RED.nodes.registerType("recup", ReCupNode);
}