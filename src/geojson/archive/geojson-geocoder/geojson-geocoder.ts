// IN:  GeoJSON object as message payload
// OUT: GeoJSON object as message payload


import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import { HereGeocoderBackend } from './backends/HereGeocoderBackend';
import { HereBatchGeocoderBackend } from './backends/HereBatchGeocoderBackend';



module.exports = function (RED: any) {


    class GeocoderNodeConfig {
        constructor(public outfilePath: string,
            public query_field_name: string,
            public here_api_key: string
        ) { }
    }


    class GeocoderNode extends AbstractNode {

        constructor(public config: any) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        async onInput(msg: any) {

            this.status(new NodeStatus("Geocoding in progress ..."))

            let geojson = msg.payload


            //let geocoder = new HereGeocoderBackend("https://geocode.search.hereapi.com/v1/geocode", this.config.here_api_key)

            let geocoder = new HereBatchGeocoderBackend("https://geocode.search.hereapi.com/v1/geocode", this.config.here_api_key)



            let result = await geocoder.geocode(geojson, this.config.query_field_name).catch((e) => {
                console.log("ERRROR: " + e)
            })

            this.status(new NodeStatus("Geocoding complete."))
          
            msg.payload = result

            this.send(msg)
        }
    }

    RED.nodes.registerType("geocoder", GeocoderNode);
}