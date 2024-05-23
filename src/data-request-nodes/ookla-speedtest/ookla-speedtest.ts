import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import axios, { AxiosResponse } from 'axios'
import * as fs from 'fs'
import * as streamZip from 'node-stream-zip'

import * as gdal from 'gdal-async'
import * as turf from '@turf/turf'
import { getAbsoluteFilePath } from 'node-red-typescript-essentials/tempDirUtil'
// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class OoklaSpeedTestConfigNode  {
        constructor(
          public api_url: string, 
          public bbox: string, 
          public save_phenomenom: string
    
            ) { }
    }


    class OoklaSpeedTestNode extends AbstractNode {


        constructor(public config: OoklaSpeedTestConfigNode) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {
            try{
                this.status(new NodeStatus("Requesting Data..."));

                const date  = new Date()

                //January is 0 therefore +1
                let month: number = date.getMonth()+1
                let year:number = date.getFullYear()

                //get currQuarter
                let currQuarter:number = this.getQuarter(month)
                let otherQuarter:any = undefined

                let zipName: string = year.toString() + "_" + currQuarter.toString() + "_gps_" + this.config.save_phenomenom + "_tiles.zip"
                let folderName: string = year.toString() + "_" + currQuarter.toString() + "_gps_" + this.config.save_phenomenom + "_tiles"
                
                let zipPath = getAbsoluteFilePath(zipName, "")
                let folderPath = getAbsoluteFilePath(folderName, "")

                let dataset: any = undefined
                //##################### check if file already exists #####################
                if(fs.existsSync(folderPath)){
                    this.status(new NodeStatus("File already exists, loading..."))

                    fs.readdirSync(folderPath).forEach(file => {

                        if(file.includes(".shp")){
                            try{
                                dataset = gdal.open(folderPath+"/"+file)
                            }
                            catch{
                                throw "Ookla-speedtest-request: could not read shapefile form disk"
                            }
                        }

                    });
                }
                //##################### check if file already exists #####################
            // not else bc, if reading of existing file fails we can still try downloading it again
            if(dataset == undefined){
                let url:string = this.buildUrl(this.config.api_url, this.config.save_phenomenom, currQuarter, year)

                this.status(new NodeStatus("Requesting Data"))

                let res = await axios.get(url, {responseType: 'arraybuffer'}).catch((error) => {}) as AxiosResponse 

                if(res == undefined){

                    this.status(new NodeStatus("Current Quarter not available, reuqesting earlier quarter"))

                    otherQuarter = currQuarter -1
    
                    if(currQuarter == 1){
    
                        otherQuarter = 4
                        year = year - 1
                    }

                    

                    folderName = year.toString() + "_" +otherQuarter.toString() + "_gps_" + this.config.save_phenomenom + "_tiles"
                    zipName = year.toString() + "_" +otherQuarter.toString() + "_gps_" + this.config.save_phenomenom + "_tiles.zip"

                    zipPath = getAbsoluteFilePath(zipName, "")
                    folderPath = getAbsoluteFilePath(folderName, "")
                    
                    if(fs.existsSync(folderPath)){
                        this.status(new NodeStatus("Earlier quarter-file already exists, loading..."))
                        fs.readdirSync(folderPath).forEach(file => {
                            
                            if(file.includes(".shp")){
                                try{
                                    dataset = gdal.open(folderPath+"/"+file)
                                }
                                catch{
                                    throw "Ookla-speedtest-reuqest: could not read shapefile form disk"
                                }
                            }
        
                        });
                    }
                    // not else bc, if reading of existing file fails we can still try downloading it again
                    if(dataset == undefined){
                        this.status(new NodeStatus("Earlier quarter-file not available, reuqesting quarter"))
                        let otherUrl:string = this.buildUrl(this.config.api_url, this.config.save_phenomenom, otherQuarter, year)

                        let otherRes = await axios.get(otherUrl, {responseType: 'arraybuffer'}) as AxiosResponse
        
                        if(otherRes == undefined){
                            throw "Download failed, response is undefined";
                        }
                        else{
                            res = otherRes
                        }
                        
                        if (!fs.existsSync(folderPath)){
                            fs.mkdirSync(folderPath);
                        }

                        fs.writeFileSync(zipPath, res.data)

                        this.status(new NodeStatus("Writing zip-file"))
                        try{
                            const zip = new streamZip.async({ file: zipPath });
                            this.status(new NodeStatus("Extracting zip-file"))
                            await zip.extract(null, folderPath)
                        }
                        catch{
                            throw "Ookla-speedtest-reuqest: could not read zip-file form disk"
                        }

                        fs.readdirSync(folderPath).forEach(file => {
        
                            if(file.includes(".shp")){
                                delete res.data;
                                try{
                                    dataset = gdal.open(folderPath+"/"+file)
                                }
                                catch{
                                    throw "Ookla-speedtest-reuqest: could not read shapefile form disk"
                                }
                            }
        
                        });
                    }
                }
            }

            if(dataset == undefined){
                throw "Ookla-speedtest-reuqest: dataset not available. API might have changed, please check"
            }
                
           
            let bbox:any = this.config.bbox.split(',').map(Number);
            let bboxPoly: any = turf.bboxPolygon(bbox)
	
            let bboxGeometry:any = gdal.Geometry.fromGeoJson(bboxPoly.geometry)
            this.status(new NodeStatus("Spatial query"))


            const layer = dataset.layers.get(0)

            if(layer.srs.toWKT() != bboxGeometry.srs.toWKT()){

                throw "Ookla-speedtest-reuqest: epsg of shapefile changed, please check!"
        
            }

            layer.setSpatialFilter(bboxGeometry)

            let feature: any = layer.features.first()

            let geoJSON:any = {
                "type":"FeatureCollection",
                "features":[]
            }

            let layerFieldNames: any = layer.fields.getNames()

            if(!(layerFieldNames.includes("avg_d_kbps")) || !(layerFieldNames.includes("avg_u_kbps")) || !(layerFieldNames.includes("avg_lat_ms")) ){
                throw "Ookla-speedtest-reuqest: layer field names changed, please check."
            }

            this.status(new NodeStatus("Creating out-GeoJSON"))
            while (feature) { 

                let geoJsonFeature:any = {
                    "type":"Feature",
                    "properties":{},
                    "geometry":JSON.parse(feature.getGeometry().toJSON())
                }

                for(let field of feature.fields.getNames()){
                    geoJsonFeature.properties[field] = feature.fields.get(field)

                }


                geoJSON.features.push(geoJsonFeature)
                
               
                feature = layer.features.next()
            }

            if(geoJSON.features.length == 0){
                throw "Ookla-speedtest-reuqest: no features in geojson."
            }
            msg.payload = geoJSON
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


        buildUrl(baseUrl: string, type:string,quarter:number, year:number){

            let months: Array<string> = ["01","04","07","10"]
            
            return baseUrl + "type=" + type + "/year=" + year.toString() + "/quarter=" + quarter + "/" + year.toString() + "-" + months[quarter-1].toString() + "-01_performance_" + type + "_tiles.zip"

        }

        getQuarter(month:number){

            if(month == 1 || month < 4) return 1
            
            else if(month == 4 || month < 7) return 2

            else if(month == 7 || month < 10) return 3

            else return 4
        }
    }



    RED.nodes.registerType("OklaaSpeedTest", OoklaSpeedTestNode);
}
