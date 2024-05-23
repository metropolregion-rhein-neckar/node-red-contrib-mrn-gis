import axios, { AxiosResponse } from 'axios'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import * as moment from 'moment'


// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class UBARequestNodeConfig {
        constructor(
            public api_url: string,
            public date_from: string,
            public date_to: string,
            public time_from: string,
            public time_to: string,
            public scope: string,
        ) { }
    }

    class UBARequestNode extends AbstractNode {


        oldOutfile: string = "";

        constructor(public config: UBARequestNodeConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        async onInput(msg: any, send: any, done: any) {
            try{
            this.status(new NodeStatus("Requesting Data..."));

            let now = moment()

            let date_start: string = now.toISOString()

            if (this.config.date_from == "") {

                this.config.date_from = date_start.substring(0, 10)
            }

            if (this.config.date_to == "") {

                this.config.date_to = date_start.substring(0, 10)
            }

            if (this.config.time_from == "") {

                this.config.time_from = (parseInt(date_start.substring(11, 13))).toString()

            }

            if (this.config.time_to == "") {

                this.config.time_to = (parseInt(date_start.substring(11, 13))).toString()
            }


            let url: string = this.config.api_url + '?date_from=' + this.config.date_from + '&date_to=' + this.config.date_to + '&time_from=' + this.config.time_from + '&time_to=' + this.config.time_to + '&scope=' + this.config.scope + '&station='            

            // let uba_stations = [['DEBW005', 'Mannheim', [8.4653, 49.5441]],
            //                     ['DEBW009', 'Heidelberg', [8.6767, 49.4195]],
            //                     ['DEBW010', 'Wiesloch', [8.7001, 49.3007]],
            //                     ['DEBW098', 'Mannheim', [8.472, 49.4926]],
            //                     ['DEHE028', 'Fürth', [8.8173, 49.6535]],
            //                     ['DEHE063', 'Heppenheim (Bergstraße)', [8.642, 49.6432]],
            //                     ['DERP001', 'Ludwigshafen', [8.4023, 49.515]],
            //                     ['DERP003', 'Ludwigshafen', [8.4259, 49.4555]],
            //                     ['DERP023', 'Worms', [8.3648, 49.6288]],
            //                     ['DERP025', 'Wörth am Rhein', [8.2535, 49.0523]],
            //                     ['DERP026', 'Frankenthal (Pfalz)', [8.3553, 49.5333]],
            //                     ['DERP041', 'Ludwigshafen', [8.4439, 49.4785]],
            //                     ['DERP053', 'Speyer', [8.423, 49.3511]]
            //                     ]

            let uba_stations = [['216', 'Mannheim', [8.4653, 49.5441]],
                                ['220', 'Heidelberg', [8.6767, 49.4195]],
                                ['221', 'Wiesloch', [8.7001, 49.3007]],
                                ['299', 'Mannheim', [8.472, 49.4926]],
                                ['656', 'Fürth', [8.8173, 49.6535]],
                                ['691', 'Heppenheim (Bergstraße)', [8.642, 49.6432]],
                                ['1438', 'Ludwigshafen', [8.4023, 49.515]],
                                ['1440', 'Ludwigshafen', [8.4259, 49.4555]],
                                ['1460', 'Worms', [8.3648, 49.6288]],
                                ['1462', 'Wörth am Rhein', [8.2535, 49.0523]],
                                ['1463', 'Frankenthal (Pfalz)', [8.3553, 49.5333]],
                                ['1475', 'Ludwigshafen', [8.4439, 49.4785]],
                                ['1487', 'Speyer', [8.423, 49.3511]]
                                ]

            let dict_key = this.config.date_from + ' ' + (parseInt(this.config.time_from) - 1).toString() + ':00:00'


            if (parseInt(this.config.time_from) - 1 <= 9) {
                dict_key = this.config.date_from + ' 0' + (parseInt(this.config.time_from) - 1).toString() + ':00:00'
            }

            let geojson: any = {
                "type": "FeatureCollection",
                "features": []
            }
            for (let station of uba_stations) {

                let req_url = url + station[0]
                console.log(req_url)
                this.status(new NodeStatus("Downloading from UBA", Fill.green, Shape.ring))

                let res = await axios.get(req_url) as AxiosResponse;

                if (res == undefined) {
                    throw "Download failed, response is undefined";
                  }


                if(!("data" in res.data)){
                    throw "Uba-Request: response structure changed, data not in response"
                }

                if(!(station[0].toString() in res.data.data)){
                    throw `Uba-Request: Station Id for ${station[1]} changed`
                }

                let data: any = res.data.data[station[0].toString()]


                if (data[dict_key] == undefined) {

                    throw "Uba-Request structure changed, date/time no longer a key"

                }

                if(!(data[dict_key] instanceof Array) || data[dict_key].length < 3){
                    throw "Uba-Request structure changed, data[dict_key] is no longer an array or length of array changed"

                }
             
                    let feature = {
                        "type": "Feature",
    
                        "properties": {                        
                            "timestamp": data[dict_key][3],
                            "id": station[0],
                            "PM10": data[dict_key][2],
                            "unit": "µg/m³",
                            "source": "Umweltbundesamt"
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [station[2][0], station[2][1]]
                        }
                    }
    
    
                    if (data[dict_key][2] != null) {
                        geojson.features.push(feature)
                    }

            }


            msg.payload = JSON.parse(JSON.stringify(geojson))

            send(msg)

            let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
            this.status(info);
    
            done();
            }catch(e){
                done(e);
                console.log(e);
                let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
                this.status(info);
            }
        }
    }

    RED.nodes.registerType("uba-request", UBARequestNode);
}

