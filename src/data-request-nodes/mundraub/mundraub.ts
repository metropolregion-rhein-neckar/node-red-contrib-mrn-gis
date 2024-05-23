import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as cheerio from 'cheerio'
import axios, { AxiosResponse } from 'axios'
import {getRequest} from '../../requestUtils'

// Out: GeoJSON object as payload

module.exports = function (RED: any) {

    class MundraubNodeConfig  {
        constructor(public api_url: string, 
          public bbox: string, 
          public outfilePath: string,          
          public zoom: string,
    
            ) { }
    }


    class MundraubNode extends AbstractNode {

        oldOutfile: string = "";

        constructor(public config: MundraubNodeConfig) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {
          try{
            this.status(new NodeStatus("Requesting Data..."));

          let cluster_url: string = this.config.api_url + '?'
          cluster_url += 'bbox='+this.config.bbox
          cluster_url += '&zoom='+this.config.zoom

          let res_cluster  = await axios.get(cluster_url) as AxiosResponse
          
          if (res_cluster == undefined) {
            throw "Download failed, response is undefined";

          }

          let data_cluster = res_cluster.data

          if(!("features" in data_cluster) || !(data_cluster.features instanceof Array)){
            throw "mundraub-request: Response structure changed, response is no longer a GeoJSON FeatureCollection"
          }

          let geojson :any = {
            "type":"FeatureCollection",
            "features":[]
          }

          for(let node of data_cluster.features){

            if(!("pos" in node) || !(node.pos instanceof Array)){
              throw "mundraub-request: node has no pos key or structure of pos changed, please check manually"
            }

            let feature: any = {
              "type": "Feature",
       
                  "properties": {
                  },
                  "geometry": {
                    "type": "Point",
                    "coordinates": [parseFloat(node.pos[1]), parseFloat(node.pos[0])]
                  }
            }

            // scrape node metadata from mundraub.org

            this.status(new NodeStatus("Start scraping metadata"))

            if(!("properties" in node) || !("nid" in node.properties)){
              throw "mundraub-request: node has no properties key or propeties does not have a nid key, please check manually"
            }

           feature.properties.nid = node.properties.nid


          let node_url:string = "https://mundraub.org/node/"+node.properties.nid

            let res_node = await axios.get(node_url) as AxiosResponse

            if (res_node == undefined) {
              throw "Download failed, response is undefined";

            }

            
            let data_node:any = res_node.data

            const selector = cheerio.load(data_node)

            try{
              feature.properties.kind = selector(".article-inside").find('h2').first().text().trim()

              feature.properties.street = selector(".article-inside").find("div[class='address road display-inline']").first().text().trim()
  
              feature.properties.plz = selector(".article-inside").find("div[class='address plz display-inline']").first().text().trim()
  
              feature.properties.city = selector(".article-inside").find("div[class='address city display-inline']").first().text().trim()
  
              feature.properties.description = selector(".article-inside").find("div[class='content body-text processed_text simple_text']").find('p').first().text().trim()
  
              feature.properties.created_at = selector(".article-inside").find("div[class='submitted iota'] :nth-child(2)").text()
              
              feature.properties.url = node_url

              geojson.features.push(feature)
            }
            catch{
              throw "mundraub-request: Scraping of Metadata failed, please check manually"
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

    RED.nodes.registerType("mundraub", MundraubNode);
}
