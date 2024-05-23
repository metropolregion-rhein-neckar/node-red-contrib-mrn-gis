// IN:  GeoJSON object as message payload
// OUT: GeoJSON object as message payload

import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import * as turf from "@turf/turf"

module.exports = function (RED: any) {

    class GeoJsonToCentroidsNode extends AbstractNode {

        constructor(public config: any) {
            super(config, RED)

            this.on('input', this.onInput);
        }

        async onInput(msg: any, send:any, done:any) {

            
            // Reset status:
            this.status(new NodeStatus("Converting geometries to centroid points ..."))

            // Clone message payload:
            let result = JSON.parse(JSON.stringify(msg.payload))

            let centroid_features = []

            for (let feature of result.features) {

                if (!('geometry' in feature)) {
                    continue
                }

                let centroid = null

                try {
                    centroid = turf.centroid(feature)
                }
                catch (e) {
                    console.log("Failed to convert geometry to centroid: " + e)
                }

                if (centroid != null) {
                    feature.geometry = centroid.geometry

                    centroid_features.push(feature)
                }
                else {
                    // TODO: Add config option to select behaviour when centroid calculation failed
                    //delete(feature.geometry)
                }
            }

            result.features = centroid_features

            msg.payload = result

            // Send outgoing message:
            send(msg)

            let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully clipped" };
            this.status(info)
            done();
        }
    }

    RED.nodes.registerType("geojson-to-centroids", GeoJsonToCentroidsNode);
}