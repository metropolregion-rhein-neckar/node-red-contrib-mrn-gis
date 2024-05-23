import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as fs from 'fs'
import axios, { AxiosResponse } from 'axios'
import * as csv from 'csv-parse/lib/sync'
import { object } from 'underscore'


module.exports = function (RED: any) {

    class RegionalstatistikConfigNode  {
        constructor(public code: string, 
          public agsfile: string, 
          public startyear: string,
          public endyear: string,
          public user: string,
          public password: string,
          public agscodes: string,
          public save_time: string,
          public transpose: boolean
    
            ) { }
    }


    class RegionalstatistikNode extends AbstractNode {

        oldOutfile: string = "";

        constructor(public config: RegionalstatistikConfigNode) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any) {
          this.status(new NodeStatus(""))
          // To Do: Eingabefeld für file aus denen AGS und geometry gelesen werden kann
          // Eingabefeld für AGS Manuell
          // start_year, end_year

          let agsString : string = ""

          let agsJSON: any;

          if(this.config.agsfile != ""){

            let agsData: any = fs.readFileSync(this.config.agsfile, 'utf-8')
            agsJSON  = JSON.parse(agsData) as any;

            for(let feature of agsJSON.features){
              
              agsString += feature.properties.AGS.toString()+","

            }
          }
          else{

            agsString = this.config.agscodes
          
          }

          agsString = agsString.slice(0, -1)

          let url : string = "https://www.regionalstatistik.de/genesisws/rest/2020/data/tablefile?"
          url += "username="+this.config.user
          url += "&password="+this.config.password
          url += "&name=" + this.config.code
          url += "&area=all&"
          if(this.config.transpose){
            url += "transpose=true"
          }
          else{
            url += "transpose=false"

          }
          url += '&compress=true'

          if(this.config.save_time == 'timeseries'){
            url += "&startyear="+this.config.startyear
            url += "&endyear="+this.config.endyear
          }

          url += "&regionalkey="+agsString
          url += "&language=de"
          url += "&format=ffcsv"
          url += "&job=false"
          


          this.status(new NodeStatus("Requesting Data"))

          let res = await axios.get(url).catch((error) => { 
            
            this.status(new NodeStatus("Simple request failed, trying alternatives"))
              
          }) as AxiosResponse
          


          if(res == undefined){
            this.status(new NodeStatus("Download failed, try compress=false"))
            // if donwload fails, try compress = false

            url = url.replace('compress=true','compress=false')

            res = await axios.get(url).catch((error) => { 
              this.status(new NodeStatus("Download with compress=false failed, check manually"))

            
              this.error(error, msg)
              
              return
      
            }) as AxiosResponse


            if(res == undefined){
              this.status(new NodeStatus("Download with compress=false failed, check manually"))
              return

            }
          }

          let data = res.data;

          // if table to big change job to true and request agian
          if(typeof data == "object" && data.Status.Code == 98){
            this.status(new NodeStatus("Table to big try downloading as Job"))
            url = url.replace('job=false', 'job=true')



            res = await axios.get(url).catch((error) => { 
              this.status(new NodeStatus("Job request failed"))
            
              this.error(error, msg)
              
              return
      
            }) as AxiosResponse


            data = res.data
            

            if(res == undefined){
              this.status(new NodeStatus("Job request failed, response is undefined"))
              return

            }

          }

          if(typeof data == "object" && data.Status.Code == 99){

            let urlResultFile = "https://www.regionalstatistik.de/genesisws/rest/2020/data/resultfile?"
            urlResultFile += "username="+this.config.user
            urlResultFile += "&password="+this.config.password

            let tableName = data.Status.Content

            tableName = tableName.split(':')

            tableName = tableName[tableName.length-1].replace(" ", "")

            urlResultFile += "&name=" + tableName + "&area=all&compress=true&format=ffcsv&language=de"

            this.status(new NodeStatus("Waiting for job to finish"))

            this.pause(60)

            res = await axios.get(urlResultFile).catch((error) => { 
              this.status(new NodeStatus("Job Download failed"))
            
              this.error(error, msg)
              
              return
      
            }) as AxiosResponse
            
            if(res == undefined){
              this.error('Jon Request failed', msg)
              this.status(new NodeStatus("Job Download failed, response is undefined"))
              
              return
            }
            

            data = res.data


          }
          
          if(this.config.agscodes!=""){

            msg.payload = JSON.parse(JSON.stringify(data))

            send(msg)

            return
          }



          //Check first row for duplicated values and add suffix
          function getFirstLine(text:string) {
            let index:any = text.indexOf("\n");
            if (index === -1) index = undefined;
            return [text.substring(0, index), index];
          }

          data = data.replace(',', '.')

          let firstLine: Array<any> = getFirstLine(data)


          let colNames: string = firstLine[0]

          let colArray: Array<string> = colNames.split(';')

          // Maybe add check if there are any duplicated cols and only do this if true.
          let colCount: any = {}

          // count the number of each array element and map to object
          colArray.forEach(function(x:any) {colCount[x] = ( colCount[x] || 0)+1 })

          // check if any element is a duplicate
          for(let key in colCount){

            // Not sure if duplicates only come in pairs or more times, therefore this is needed
            if(colCount[key]>= 2){

              const indexOfAll = (arr: Array<any>, val:string) => arr.reduce((acc, el, i) => (el === val ? [...acc, i] : acc), []);

              let indices: Array<number> = indexOfAll(colArray, key)

              for(let i = 1; i<indices.length; i++){
                colArray[indices[i]] = colArray[indices[i]] + '_' + String(i+1)
              }
            }
          }


          // construct new first line
          let newFirstLine:string = "";

          for(let colName of colArray){

            newFirstLine += colName+';'

          }

          newFirstLine = newFirstLine.slice(0,-1)
          //newFirstLine += '\n'


          // slice of old firstLine
          data = data.slice(firstLine[1],data.length)
          
          // add new firstLine
          data = newFirstLine+data

          // replace all "," between to numbers
          let regex = /(?<=\d),(?=\d)/g
          data = data.replace(regex, '.')

          const records: any = csv.parse(data, {columns:true, trim:true, delimiter:";"})

          // skip cols containing ags name of spatial entity etc.

          let skipRows: Array<any> = ['Statistik_Code', 'Statistik_Label', 'Zeit_Label', 'Zeit',
                                      '1_Merkmal_Code', '1_Merkmal_Label', '1_Merkmal_Label', 
                                      '1_Auspraegung_Code', '1_Auspraegung_Label']



          
          for(let feature of agsJSON.features){

            for(let entry of records){

              if(feature.properties['AGS'] == entry['1_Auspraegung_Code']){

                let objKeys:any = Object.keys(entry)
                //let beforeLast: any = objKeys[objKeys.length -2]

                // find last col with entry
                let valueCols: Array<string> = [];

                // find all cols with numeric values

                for(let i = objKeys.length-1; i>=0; i--){

                  if(!(isNaN(entry[objKeys[i]])) && entry[objKeys[i]] != "" && !(skipRows.includes(objKeys[i])) ){

                      valueCols.push(objKeys[i])
                
                  }
                }

                  for(let valueCol of valueCols){ 

                    // build col name from cols in front of valueCol, exclude other valueCols in same row

                    let propName: string = valueCol;


                    for(let i = 0; i < objKeys.length; i++){

                      if(objKeys[i]==valueCol){
                        break
                      }
                      
                      
                      if(!(skipRows.includes(objKeys[i])) && !(objKeys[i].includes('Code')) && !(valueCols.includes(objKeys[i])) ){
                      
                        propName += '_' + entry[objKeys[i]]
  
                  
                      }
                    }

                    propName += '_' + entry.Zeit
                    try{
                      feature.properties[propName] = parseFloat(entry[valueCol]);
                    }
                    catch{
                      feature.properties[propName] = null;
                    }
    
                    
    
                    feature.properties.Stand = entry.Zeit
                    feature.properties.Code = entry.Statistik_Code
                    feature.properties.ZeitCode = entry.Zeit_Code
                    feature.properties.Tabelle = this.config.code

                  }
                } 
              }

            }
          
          msg.payload = JSON.parse(JSON.stringify(agsJSON))

                      
          this.status(new NodeStatus("Regiostat table succsessfully saved"))

          this.send(msg)

        }

        pause(sceconds:number):any {

          sceconds = sceconds*1000

          let dt:any = new Date()

          let newDate:any = new Date()

          while (newDate - dt <= sceconds) { /* Do nothing */ 
            
            newDate = new Date()

          }
        }
  }

    RED.nodes.registerType("regionalstatistik", RegionalstatistikNode);
}
