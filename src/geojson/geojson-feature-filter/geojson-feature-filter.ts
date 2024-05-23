import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as turf from '@turf/turf'
import { feature } from '@turf/turf'
import { any } from 'underscore'


module.exports = function (RED: any) {

    class GeojsonFeatureFilterConfig {
        constructor(
            public save_phenomenom:string,
            public property: string,
            public value: string,
            public empty: boolean,
            public buffer: string
            ) { }
    }

    class GeojsonFeatureFilterNode extends AbstractNode {

        // TODO: 2 Define Config class
        constructor(public config: GeojsonFeatureFilterConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {
            try{

                this.status(new NodeStatus(""))
                this.status(new NodeStatus("Starting filtering"))

                let result = JSON.parse(JSON.stringify(msg.payload)) as any;

                if(!("features" in result) || !(result.features instanceof Array)){
                    this.status(new NodeStatus("Aborted, msg does not contain a valid geoJSON"))

                }

 
                if(this.config.save_phenomenom == "outliers"){
                    result = this.filter_outliers(result, this.config.property)
                }

                if(this.config.save_phenomenom == "values"){

                    result = this.removeFeaturesByAttributeValue(result, this.config.property, this.config.value)
                }

                if(this.config.save_phenomenom == "values_empty" || this.config.empty==true){

                    result = this.removeFeaturesByAttributeValue(result, this.config.property, "")
                    result = this.removeFeaturesByAttributeValue(result, this.config.property, null)
                    result = this.removeFeaturesByAttributeValue(result, this.config.property, undefined)
                }

                // ########### ToDo: add support for all geometry types ###########
                if(this.config.save_phenomenom == "feature_buffer"){
                    result = this.removeFeaturesWithinBufferOfEachOther(result);
                }

                if(this.config.save_phenomenom == "remove_equal_values"){
                    result = this.removeFeaturesWithEqualValues(result, this.config.property)
                }

                // Send outgoing message:
                msg.payload = result
                
                send(msg)

                let info: any = { fill: "green", shape: "dot", text: "Filtering Successfull" };
                this.status(info)
                done();

            }catch(e){
                done(e);
                let info: any = { fill: "red", shape: "dot", text: "Stopped request because of error" };
                this.status(info);
            }

        }


        sortFeaturesByCompletness(geojsonFeatureArray:any){            

            return geojsonFeatureArray.sort((a:any, b:any) => {
                const aKeys = Object.keys(a).filter(key => a[key] !== null && a[key] !== undefined && a[key] !== '');
                const bKeys = Object.keys(b).filter(key => b[key] !== null && b[key] !== undefined && b[key] !== '');
                return bKeys.length - aKeys.length;
              });
        }

        removeFeaturesWithEqualValues(geojson:any, property:string){

            let result : any =  {
                "type":"FeatureCollection",
                "features": []
            };

            const uniquePropValues: any = {}

            let features = geojson.features
            features = this.sortFeaturesByCompletness(features)

            for(const feature of features){

                if(!uniquePropValues[feature.properties[property]]){

                    uniquePropValues[feature.properties[property]] = true
                    result.features.push(feature)
                }
            }

            return result
        }

        removeFeaturesWithinBufferOfEachOther(geojson: any){

            let features = geojson.features

            features = this.sortFeaturesByCompletness(features)
            
            let removedFeatures:any = {}

            const filteredFeatures = features.filter((feature:any, index:number, array:any) => {

                if(removedFeatures[index.toString()]){

                    return true

                }

                const featurePoint = turf.point(feature.geometry.coordinates);

                for (let i = 0; i < array.length; i++) {

                    if (i !== index) {

                    const otherPoint = turf.point(array[i].geometry.coordinates);
                    const distance = turf.distance(featurePoint, otherPoint, { units: 'meters' });

                    if (distance <= parseFloat(this.config.buffer)) {
                        
                        removedFeatures[i.toString()] = true
                    
                        return false;
                    }
                    }

                }
                return true;
                
              });
              

            let result : any =  {
                "type":"FeatureCollection",
                "features": filteredFeatures
            };

            return result
        }

        removeFeaturesByAttributeValue(geojson: any, property:any, value:any){

            let featureArray = geojson.features.filter((feature: any) => feature.properties[property] !== value);

            let result: any = {
                "type":"FeatureCollection",
                "features":featureArray
            };

            return result;
        }


        filter_outliers(geojson: any, property: string){
            
            // calculate 
            let values: Array<number> = []
            for(let feature of geojson.features){
                let value: number = feature.properties[property]
                values.push(value)
            }

            values.sort( (a, b) => {
                return a - b;
            });

            let q1: number = values[Math.floor((values.length / 4))];
            let q3: number = values[Math.ceil((values.length * (3 / 4)))]

            let iqr: number = q3 - q1

            let maxValue: number = q3 + iqr*1.5
            let minValue: number = q1 - iqr*1.5

            //let dynamic_length = geojson.features.length

            let result: any = {
                "type":"FeatureCollection",
                "features":[]
                }

            for(let i = 0; i<geojson.features.length;i++){
                if(geojson.features[i].properties[property]<= maxValue 
                    && geojson.features[i].properties[property]>= minValue){
                        result.features.push(geojson.features[i])
                }
            }

            return result

        }

    }

    
    RED.nodes.registerType("geojson-feature-filter", GeojsonFeatureFilterNode);
}