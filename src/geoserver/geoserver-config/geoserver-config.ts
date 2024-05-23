
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'



module.exports = function (RED: any) {

    class GeoServerConfig extends AbstractNode {
     
        constructor(public config: any) {
            super(config, RED)          
        
            this.on('input', this.onInput);
        }

        onInput(msg: any) {}
    }

    RED.nodes.registerType("geoserver-config", GeoServerConfig);
}