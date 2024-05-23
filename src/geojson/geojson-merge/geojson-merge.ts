// IN:  One or more messages containing GeoJSON objects as payload
// OUT: GeoJSON object as message payload


// TODO: 2 If possible, not just count the incoming messages to determine when it is time to merge. 
// Instead, try to check whether a message has arrived from each particular input node.

import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

module.exports = function (RED: any) {

    class GeoJSONMergeConfigNode  {
        constructor(public outfilePath: string,
            public time: string,
            public action: string,
            public key: string
        ) { }

    }

    // for join only 2 at a time, for merge it doesnt matther
    // only inner join supported
    class GeoJSONMergeNode extends AbstractNode {

        inputCount = 0
        all_geojsons: any = []


        timer: any;


        constructor(public config: GeoJSONMergeConfigNode) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        onInput(msg: any, send: any, done:any) {
            this.status(new NodeStatus(""))
            this.status(new NodeStatus("Waiting for other GeoJSON"))

            // Set Timer for first Input
            if (this.inputCount == 0) {
                this.timer = setTimeout(() => { this.status(new NodeStatus("Merge Node had a timeout")), 
                this.error("merge node timed out", msg) }, parseInt(this.config.time) * 1000)
                this.status(new NodeStatus("Waiting for other GeoJSON"))
            }

            let geojson = JSON.parse(JSON.stringify(msg.payload))


            this.all_geojsons.push(geojson)

            this.inputCount++
            

            if (this.inputCount == this.getPrevNodes().length &&   this.config.action == "merge") {
                this.status(new NodeStatus("Merging Features"))

                let geoJSON = this.mergeFeatures(this.all_geojsons)
                this.writeOutfile(msg, geoJSON)

                let info: any = { fill: "green", shape: "dot", text: "successfully merged features" };
                this.status(info)
                done();
            }

            if (this.inputCount == this.getPrevNodes().length  && this.config.action == "joinProps") {

                let geoJSON = this.mergeProperties(this.all_geojsons, this.config.key)
                this.writeOutfile(msg, geoJSON)

                let info: any = { fill: "green", shape: "dot", text: "successfully joined Properties" };
                this.status(info)
                done();
                
            }
        }


        writeOutfile(msg: any, geoJSON: any) {


            // Clear Timer
            clearTimeout(this.timer)

            
            msg.payload = JSON.parse(JSON.stringify(geoJSON))

            // Send outgoing message:
            this.send(msg)


            // Reset:
            this.inputCount = 0
            this.all_geojsons = []

        }


        mergeFeatures(geoJsonArray: Array<any>) {
            let result: any = { "type": "FeatureCollection", "features": [] }

            for (let geoJSON of geoJsonArray) {

                if(geoJSON.features instanceof Array){
                    result.features = result.features.concat(geoJSON.features)
                }

            }

            return result
        }


        mergeProperties(geoJsonArray: Array<any>, key: string) {

            let result:any = {
                "type":"FeatureCollection",
                "features":[]
            }
            // key has to be unique? --> filter for undefined!!!
            // the first geoJSON is used as base!
            for(let geoJSON of geoJsonArray){

                if(result.features.length == 0){
                    result.features = geoJSON.features
                    continue
                }

                let geoJSONIndex: number = geoJsonArray.indexOf(geoJSON)


                for(let feature of geoJSON.features){

                    for(let featureResult of result.features){

                        if(feature.properties[key] != featureResult.properties[key]){
                            continue
                        }

                        // ##################### start handling for duplicated keys #####################
                        const [k1, k2] = [Object.keys(feature.properties), Object.keys(featureResult.properties)];
                        const [first, next] = k1.length > k2.length ? [k2, feature.properties] : [k1, featureResult.properties];
                        let intersection = first.filter(k => k in next);

                        for(let duplicate of intersection){

                            if(duplicate == key){
                                continue
                            }

                            let newKey = duplicate + "_" + geoJSONIndex.toString()
                            feature.properties[newKey] = feature.properties[duplicate]

                            delete feature.properties[duplicate]
                        }
                        // ##################### end handling for duplicated keys #####################

                        // merge props
                        featureResult.properties = {...featureResult.properties, ...feature.properties}

                    }
                }
            }


            return result

        }
    }

    RED.nodes.registerType("geojson-merge", GeoJSONMergeNode);
}
