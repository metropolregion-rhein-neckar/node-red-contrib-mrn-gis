import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import { propertyNamesToLowercase, propertyNameReplaceChars, getTimeseriesKeys } from '../../geojson-utils'
//In: geojson as object in msg.payload
//Out: geojson as object in msg.payload
module.exports = function (RED: any) {

    class GeojsonPropertiesRenamerConfig {
        constructor(
            public removeSprecialCharacters: boolean,
            public toLowerCase: boolean,
            public oldPropNames: string,
            public newPropNames: string
        ) { }
    }

    class GeojsonPropertiesRenamer extends AbstractNode {

        // TODO: 2 Define Config class
        constructor(public config: GeojsonPropertiesRenamerConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        onInput(msg: any, send:any, done:any) {

            this.status(new NodeStatus("Renaming properties ..."))

            setTimeout(() => {
                try{
                    let result = JSON.parse(JSON.stringify(msg.payload)) as any;



                    let oldPropNames = this.config.oldPropNames.split(',')
                    let newPropNames = this.config.newPropNames.split(',')

                    if(oldPropNames.length != newPropNames.length){
                        
                        throw "Number of property names doesn't match"
                        
                    }

                    result = this.propertiesRename(result, oldPropNames, newPropNames)
                    
                    
                    if(this.config.toLowerCase){
                        result = propertyNamesToLowercase(result)
                    }

                    if(this.config.removeSprecialCharacters){
                        result = propertyNameReplaceChars(result, ":", "_")
                        result = propertyNameReplaceChars(result, "ä", "ae")
                        result = propertyNameReplaceChars(result, "ö", "oe")
                        result = propertyNameReplaceChars(result, "ü", "ue")
                        result = propertyNameReplaceChars(result, " ", "")
                        result = propertyNameReplaceChars(result, "ß", "ss")
                        result = propertyNameReplaceChars(result, " ", "")
                        result = propertyNameReplaceChars(result, ",", "_")
                    }


                    // Send outgoing message:
                    msg.payload = result
                    send(msg)

                    let info: any = { fill: "green", shape: "dot", text: "successfully renamed properties" };
                    this.status(info)
                    done();
                }
                catch(e){
                    done(e);
                    let info: any = { fill: "red", shape: "dot", text: "Stopped request because of error" };
                    this.status(info);
                }
            }, 100);
 


        }


        propertiesRename(geoJSON:any, oldPropNames:any, newPropNames:any){
            

            let result:any = {
                "type":"FeatureCollection",
                "features":[]
            }


            for(let feature of geoJSON.features){

                for(let prop in oldPropNames){

                    let oldPropName: string = oldPropNames[prop]
                    let newPropName: string = newPropNames[prop]
                    // maybe use Spread operator and collect all available keys?
                    if(!feature.properties[oldPropName]){
                        continue
                    }
                    
                    feature.properties[newPropName] = feature.properties[oldPropName]
                    delete feature.properties[oldPropName]
                }

                result.features.push(feature)
            }

            return result

        }

    }


    RED.nodes.registerType("geojson-properties-renamer", GeojsonPropertiesRenamer);
}