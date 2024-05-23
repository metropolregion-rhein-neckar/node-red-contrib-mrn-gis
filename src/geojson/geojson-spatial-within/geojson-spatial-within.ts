import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as fs from 'fs'
import * as turf from '@turf/turf'

import { createGeometry } from '../../geojson-utils'
import { tryToRead } from 'node-red-typescript-essentials/util'


//In: geojson as object in msg.payload
//Out: geojson as object in msg.payload
module.exports = function (RED: any) {

    class SpatialWithinConfig {
        constructor(
            public source_layer: string,
            public intersecting_layer: string,
            public source_layer_type: string, 
            public intersecting_layer_type: string,

        ) { }
    }

    class SpatialWithinNode extends AbstractNode {

        constructor(public config: SpatialWithinConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {

            try{
                this.status(new NodeStatus(""))

                let intersecting_layer = this.parseJSON(msg, "intersecting_layer")
                let source_layer = this.parseJSON(msg, "source_layer")
                
  
                this.status(new NodeStatus("Loaded layers", Fill.green, Shape.ring))


                if (intersecting_layer.type == 'Feature') {
                    intersecting_layer = {"type":"FeatureCollection", "features":[intersecting_layer]}
                }
                if (source_layer.type == 'Feature') {
                    source_layer = {"type":"FeatureCollection", "features":[source_layer]}
                }

                let result = this.spatial_intersect_feature_collection(intersecting_layer, source_layer)

                // Write output file:

                msg.payload = result

                // Send outgoing message:
                send(msg)

                let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully clipped" };
                this.status(info)
                done();

            }catch (e) {
                done(e);
                let info: any = { fill: "red", shape: "dot", text: "Stopped request because of error" };
                this.status(info);
            }

        }

        parseJSON(msg: any, configName: string): any {

            let node: any = this;
            let result: any = null

            if(node.config[configName + "_type"] === "msg"){

                let valueFromMsg = tryToRead(msg, node.config[configName], undefined);

                if (valueFromMsg == undefined) {
                    throw Error(`msg.${node.config[configName]} does not exist`);
                }

                result = JSON.stringify(valueFromMsg)

            }
            else{

                try{
                    result = fs.readFileSync(node.config[configName], 'utf-8')
                }catch{
                    throw Error("Can't read file from disc object.");
                }
            }

            result = JSON.parse(result)

            return result;
          }

        

        spatial_intersect_feature_collection(intersecting_layer: any, source_layer: any) {

            let result: any = {
                "type": "FeatureCollection",
                "features": []
            }

            for (let feature_s of source_layer.features) {

                // Create an array of features so that you can use the same interface for both normal and multi geometries.
                let source_geometries: any = createGeometry(feature_s)

                for (let feature_i of intersecting_layer.features) {

                    // Create an array of features so that you can use the same interface for both normal and multi geometries.
                    let intersecting_geometries: any = createGeometry(feature_i)

                    // iterate over the created geometry arrays, normal geometries will always result in a length of 1
                    for(const poly of source_geometries){

                        for(const intersecting_feature of intersecting_geometries){

                            switch(intersecting_feature.geometry.type){

                                case "Point":

                                    if (turf.booleanPointInPolygon(intersecting_feature, poly)) {
                                        result.features.push(feature_i)
                                    }
                                    break;

                                case "LineString":

                                    let line_split: any = turf.lineSplit(intersecting_feature, poly)

                                    if(line_split.features.length != 0){

                                        for(let line of line_split.features){
    
                                            if(turf.booleanContains(poly,line)){
        
                                                line.properties = feature_i.properties
                                                result.features.push(line)
                                            }
                                        }
                                        
                                    }
                                    else if(turf.booleanWithin(intersecting_feature, poly)){
                                        result.features.push(feature_i)
                                    }
                                    break;
                                
                                case "Polygon":
                                    if(turf.booleanWithin(intersecting_feature, poly)){
                                        result.features.push(feature_i)
                                    }
                                    break;
                            }
                        }
                    }
                }
            }

            return result
        }
    }


    RED.nodes.registerType("geojson-spatial-within", SpatialWithinNode);
}