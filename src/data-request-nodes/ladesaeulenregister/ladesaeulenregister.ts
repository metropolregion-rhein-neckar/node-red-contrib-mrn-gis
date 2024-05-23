import axios, { AxiosResponse } from 'axios'
import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import { runInThisContext } from 'vm'

// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class LadesaeulenregisterNodeConfig  {
        constructor(
          public api_url: string, 
          public bbox: string, 
          public save_phenomenom: string,
    
            ) { }
    }


    class LadesaeulenregisterNode extends AbstractNode {


        constructor(public config: LadesaeulenregisterNodeConfig) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {

            try{
            this.status(new NodeStatus("Requesting Data..."));

            
            // #############start build query#############
            let baseUrl:string = this.config.api_url
            baseUrl += "query?where=&objectIds=&time=&f=geojson"
            
            let bbox: any = JSON.parse(this.config.bbox)
            baseUrl += "&geometry=" + encodeURIComponent(JSON.stringify(bbox))

            baseUrl += "&geometryType=esriGeometryEnvelope&inSR=102100&spatialRel=esriSpatialRelIntersects&resultType=tile&distance=0.0"
            baseUrl +="&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=true"
            baseUrl +="&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision="
            baseUrl += "&outSR=4326&datumTransformation="
            baseUrl +="&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false"
            baseUrl +="&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics="
            baseUrl +="&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false"
            baseUrl +="&returnExceededLimitFeatures=false"
            //"&quantizationParameters=%7B%22mode%22%3A%22view%22%2C%22originPosition%22%3A%22upperLeft%22%2C%22tolerance%22%3A4891.969810250004%2C%22extent%22%3A%7B%22xmin%22%3A858879.8666392223676667%2C%22ymin%22%3A6261441.8953286642208695%2C%22xmax%22%3A1104674.8498892760835588%2C%22ymax%22%3A6428728.2383762076497078%2C%22spatialReference%22%3A%7B%22wkid%22%3A102100%2C%22latestWkid%22%3A3857%7D%7D%"
            baseUrl +="&sqlFormat=none&token="
            // #############end build query#############

            let res = await axios.get(baseUrl) as AxiosResponse

            if(res == undefined){
                throw "Download failed, response is undefined";
            }
            

            let data = res.data
            if(!("features" in data) || !(data.features instanceof Array)){

                throw "ladesaeulenregister-request: Response structure changed, it is no longer a GeoJSON-FeatureCollection"
            
            }

            let numSkips:number = 0

            for(let feature of data.features){
                
                feature.properties = this.get_ladepunkte_properties(feature)
                
       
            }

            if(numSkips == data.features.length){
                throw "ladesaeulenregister-request: Response structure changed, keys of response have changed"
            }

            if(this.config.save_phenomenom != "all"){

                let new_data: any =  {
                    "type":"FeatureCollection",
                    "features":[]
                }


                for(let feature of data.features){
                    if(feature.properties.type == "Normalladeeinrichtung" && this.config.save_phenomenom == "cars"){
                        new_data.features.push(feature)
                    }
                    if(feature.properties.type == "Schnellladeeinrichtung" && this.config.save_phenomenom == "fast_car"){
                        new_data.features.push(feature)
                    }
                    if(feature.properties.ladepunkte.includes("Schuko") && this.config.save_phenomenom == "bikes"){
                        new_data.features.push(feature)
                    }
                }

                data = new_data
            }


            msg.payload = JSON.parse(JSON.stringify(data))

            send(msg)
            
            let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
            this.status(info);
    
            done();
            } catch(e){
                done(e);
                console.log(e);
                let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
                this.status(info);
            }
        }

        get_ladepunkte_properties(feature:any){

            let number_of_charge_points: number = parseInt(feature.properties['Anzahl_Ladepunkte_'])

            let range:Array<number> = [...Array(number_of_charge_points).keys()]

            let type: string = feature.properties['für_die_Überschrift_']

            let outlet_types:Array<string> = [
                                            "AC_Steckdose_Typ_2__", 
                                            "AC_Kupplung_Typ_2__", "DC_Kupplung_Combo__",
                                            "AC_Schuko__", "DC_CHAdeMO__", "Sonstige_Stecker__",
                                        ]

            let power:string = "Nennleistung_Ladepunkt_"

            let charge_points: Array<any> = []


            for(let i of range){

                i = i + 1

                let result = ""

                for(let outlet of outlet_types){

                    let prop_name: string = outlet + i.toString() + "_"

                    if(feature.properties[prop_name] != ""){

                        result += feature.properties[prop_name] + "/"
                    }
                }

                result = result.slice(0,-1)
                
                if(feature.properties[power + i.toString() + "_"] != null){
                    result += " " + feature.properties[power + i.toString() + "_"].replace(" ", "")
                    charge_points.push(result)
                }

            }

            let non_duplicates = new Set(charge_points)
            let non_duplicates_array = [...non_duplicates]

            let charge_point_description: string = ""

            for(let string of non_duplicates_array){
                let counter: number = 0

                for(let charge_point of charge_points){

                    if(string == charge_point){
                        counter += 1
                    }
                }

                charge_point_description += counter.toString() + "x" + string + ", "

            }

            charge_point_description = charge_point_description.slice(0,-2)

            let address: any = feature.properties["Standort_"].split(", ")

            let properties: any = {
                "ladepunkte":charge_point_description,
                "type":type,
                "plz":address[1].split(" ")[0],
                "stadt":address[1].split(" ")[1],
                "straße":address[0],
                "network":feature.properties["Betreiber_"],
                "source":"Ladesäulenregister",
                "adresse":address[0] + ", " + address[1].split(" ")[0] + " " + address[1].split(" ")[1]
            }

            return properties

        }

    }

    RED.nodes.registerType("Ladesaeulenregister", LadesaeulenregisterNode);
}
