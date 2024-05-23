import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import {getTimeseriesKeys } from '../../geojson-utils'


//In: geojson as object in msg.payload
//Out: geojson as object in msg.payload
module.exports = function (RED: any) {

    class GeojsonPropertiesFilterConfig {
        constructor(
            public propertiesToKeep: string
        ) { }
    }

    class GeojsonPropertiesFilter extends AbstractNode {

        // TODO: 2 Define Config class
        constructor(public config: GeojsonPropertiesFilterConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        onInput(msg: any, send:any, done: any) {

            try{

                this.status(new NodeStatus("Filtering properties ..."))

                setTimeout(() => {

                    let result = JSON.parse(JSON.stringify(msg.payload)) as any;

                    let propertiesToKeep = this.config.propertiesToKeep.split(',')


                    // Filter properties:
                    result = this.filterProperties(result, propertiesToKeep)


                    msg.payload = result
                    send(msg)

                    let info: any = { fill: "green", shape: "dot", text: "successfully filtered Properties" };
                    this.status(info)
                    done();

                }, 100);
                
            }catch(e){
                done(e);
                let info: any = { fill: "red", shape: "dot", text: "Stopped request because of error" };
                this.status(info);
            }

        }

        filterProperties(geojson: any, propertiesToKeep: Array<string>): any {

            // Create a copy of the input GeoJSON:
            let result:any = {
                "type":"FeatureCollection",
                "features":[]
            }

            for (let feature of geojson.features) {

                let newFeature: any = {
                    "type":"Feature",
                    "properties":{},
                    "geometry": feature.geometry
                }

                for (let key in feature.properties) {
                    if (propertiesToKeep.includes(key)) {
                        newFeature[key] = feature.properties[key]
                    }
                }

                result.features.push(newFeature)
            }

            return result
        }
    }


    RED.nodes.registerType("geojson-properties-filter", GeojsonPropertiesFilter);
}