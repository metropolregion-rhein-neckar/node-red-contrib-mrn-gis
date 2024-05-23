import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'


import * as moment from 'moment'


module.exports = function (RED: any) {


    class NodeErrorConfig {
        constructor(public errorThreshold: string) { }
    }

    
    class NodeErrorOutNode extends AbstractNode {


        nodeErrors: any = {}



        constructor(public config: NodeErrorConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        async onInput(msg: any, send: any) {


            let now: moment.Moment = moment()
            
            // Check if error already known
            if(msg.error.source.type in this.nodeErrors){
                //check if dateReset is extended and reset if so
                if(now.isAfter(this.nodeErrors[msg.error.source.type].dateReset)){
                    
                    this.nodeErrors[msg.error.source.type].dateReset = moment().add(1, "day")
                    this.nodeErrors[msg.error.source.type].errorCount = 0
                    this.nodeErrors[msg.error.source.type].errorMsg = []
                    
                }

                this.nodeErrors[msg.error.source.type].errorCount += 1

                if(!(this.nodeErrors[msg.error.source.type].errorMsg.includes(msg.error.message))){
                    
                    this.nodeErrors[msg.error.source.type].errorMsg.push(msg.error.message)

                }

                
            }
            
            else{

                this.nodeErrors[msg.error.source.type] = {}
                this.nodeErrors[msg.error.source.type]['dateReset'] = moment().add(1, "day")
                this.nodeErrors[msg.error.source.type]['errorCount'] = 1
                this.nodeErrors[msg.error.source.type].errorMsg = [msg.error.message]
            }
            


            if (this.nodeErrors[msg.error.source.type]['errorCount'] == parseInt(this.config.errorThreshold)) {
 

                let payload: string = "NodeRedNode of type " + msg.error.source.type + " had multiple Errors: " + this.nodeErrors[msg.error.source.type].errorMsg.join(". ") + ". Please check the flow"
                msg.payload = payload


                this.status(new NodeStatus("More than " + this.config.errorThreshold + " Errors. E-Mail sent.", Fill.red, Shape.ring))

                send(msg)

            }

        }

    }


    RED.nodes.registerType("node-error-out", NodeErrorOutNode);
}