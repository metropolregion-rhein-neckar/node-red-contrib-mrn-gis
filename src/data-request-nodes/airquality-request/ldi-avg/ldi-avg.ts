import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as proj4 from 'proj4'
import * as turf from '@turf/turf'



module.exports = function (RED: any) {

    class LuftdatenInfoAvgNodeConfig {
        constructor(public phenomenom: string
            ) { }
    }
    class LuftdatenInfoAvgNode extends AbstractNode {

        constructor(public config: LuftdatenInfoAvgNodeConfig) {
            super(config, RED)

            this.on('input', this.onInput);


        }

        async onInput(msg: any) {

            this.status(new NodeStatus(""))



            proj4.defs([[
                            "EPSG:32632","+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs"
                        ],[
                            'EPSG:4326',
                            '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees']]);


            let geojson = JSON.parse(JSON.stringify(msg.payload))

            
            let outer_loop: number = geojson.features.length    


            for(let i=0; i < outer_loop; i++){

                let over_write: boolean = false
                let counter_values : number = 1
                let value = geojson.features[i].properties[this.config.phenomenom]

                let original_feature = geojson.features[i]

                let coordinates_original = [original_feature.geometry.coordinates[0], original_feature.geometry.coordinates[1]]
                let proj_coordinates_original: any = proj4('EPSG:4326', 'EPSG:32632', coordinates_original)

                let point_original = turf.point(proj_coordinates_original)

                for(let j = i+1; j < outer_loop; j++){

                    let duplicated_feature = geojson.features[j]

                    let coordinates_duplicated = [duplicated_feature.geometry.coordinates[0], duplicated_feature.geometry.coordinates[1]]
                    let proj_coordinates_duplicated: any = proj4('EPSG:4326', 'EPSG:32632', coordinates_duplicated)
    
                    let point_dublicated = turf.point(proj_coordinates_duplicated)

                    

                    let options : object = {units:'meters'}
                    
                    let distance_2: any = turf.distance(point_original, point_dublicated, options)

                    if (distance_2 <= 5){
                        value += geojson.features[j].properties[this.config.phenomenom]
                    
                        counter_values += 1
                        outer_loop -= 1
                        over_write = true

                        geojson.features.splice(j,1)

                    }
                }

                if(over_write){
                    geojson.features[i].properties[this.config.phenomenom] = value/counter_values
                }

            }
            msg.payload = JSON.parse(JSON.stringify(geojson))
            
            this.status(new NodeStatus("LuftDatenInfo data successfully aggregated"))

            this.send(msg)
        }

    }

    RED.nodes.registerType("ldi-avg", LuftdatenInfoAvgNode);
}
