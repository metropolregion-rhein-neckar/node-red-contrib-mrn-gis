import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'

import * as fs from 'fs'
import * as turf from '@turf/turf'

import {createGeometry, getTimeseriesKeys} from '../../../geojson-utils'
import { round } from '@turf/turf'

//In: geojson as object in msg.payload
//Out: geojson as object in msg.payload


//############### DOES NOT WORK ANYMORE THEREFORE NOT INCLUDED IN PACKAGE.JSON!!!!!!!!!!!! ###############
//############### DOES NOT WORK ANYMORE THEREFORE NOT INCLUDED IN PACKAGE.JSON!!!!!!!!!!!! ###############
//############### DOES NOT WORK ANYMORE THEREFORE NOT INCLUDED IN PACKAGE.JSON!!!!!!!!!!!! ###############
//############### DOES NOT WORK ANYMORE THEREFORE NOT INCLUDED IN PACKAGE.JSON!!!!!!!!!!!! ###############

module.exports = function (RED: any) {

    class GeojsonValueOffsetConfigNode {
        constructor(
          public timeframe: string,
          public action: string,
          public offsetFile: string,
          public propName1: string,
          public propName2: string,
          public propName: string,
          public constantValue: string,
          public propLocation: string,
          public roundOption: boolean
    
            ) { }
    }

    // To Do 3: Refactor Code. No for loops in functions
    class GeojsonValueOffsetNode extends AbstractNode {

        oldOutfile: string = "";

        constructor(public config: GeojsonValueOffsetConfigNode) {
            super(config, RED)


            this.on('input', this.onInput);
        }


        async onInput(msg: any, send:any, done:any) {

            this.status(new NodeStatus(""))

            this.status(new NodeStatus("Parsing infile"))
            let geoJSON: any = JSON.parse(JSON.stringify(msg.payload))

            let offSetGeoJSON: any = null;

            if(this.config.propLocation == "otherFile"){

                let offSetFile: any = fs.readFileSync(this.config.offsetFile)
                offSetGeoJSON  = JSON.parse(offSetFile)
                
            }

            // ###############################                   ###############################
            // ############################### start single year ###############################
            // ###############################                   ###############################
            

            if(this.config.timeframe =="single"){
                // ############################### start calculation ###############################

                this.status(new NodeStatus("Calculating"))

                if(this.config.propLocation != "constValue"){

                    for(let feature of geoJSON.features){

                        this.checkPropInObj_inplace([this.config.propName1, this.config.propName2], feature)


                        if(feature.properties[this.config.propName1] == null || feature.properties[this.config.propName2] == null){

                            feature.properties[this.config.propName] = null

                        }
                        else{
                            this.calcFuncs_inplace[this.config.action](
                                feature,
                                this.config.propName1,
                                this.config.propName2,
                                this.config.propName,
                                this.config.roundOption,
                                offSetGeoJSON
                            )
                        }
                    }
                }

                if(this.config.propLocation == "constValue"){
                    for(let feature of geoJSON.features){

                        this.checkPropInObj_inplace([this.config.propName1], feature)


                        if(feature.properties[this.config.propName1] == null){

                            feature.properties[this.config.propName] = null

                        }
                        else{
                            this.constantCalcFuncs_inplace[this.config.action](
                                feature,
                                this.config.propName1,
                                this.config.constantValue,
                                this.config.propName,
                                this.config.roundOption
    
                            )
                        }
                    }
                }
                // ############################### end calculation ###############################

            }
            // ###############################                 ###############################
            // ############################### end single year ###############################
            // ###############################                 ###############################
            // ###############################                 ###############################
            // ############################### start timeseries###############################
            // ###############################                 ###############################
            if(this.config.timeframe == "timeseries"){
            
                // ############################### start get corresponding properties ###############################
                
                let propNames1 : any = getTimeseriesKeys(geoJSON, this.config.propName1)
            
                let propNames2 : any = null

                let correspondingProps: any = null

                if(offSetGeoJSON == null && this.config.propLocation != "constValue"){

                    propNames2  = getTimeseriesKeys(geoJSON, this.config.propName2)
                    correspondingProps = this.getCorrespondingProps(propNames1, propNames2)

                }
                else if(offSetGeoJSON != null){

                    propNames2 = getTimeseriesKeys(offSetGeoJSON, this.config.propName2)
                    correspondingProps = this.getCorrespondingProps(propNames1, propNames2)

                }

                // check if timesieres is proportional
                if(this.config.propLocation != "constValue" && propNames1.length != propNames2.length && this.config.action != "divideArea"){
                    // if not us the shortest as base

                    this.status(new NodeStatus("Count of props for Timeseires do not match; smallest common denominator used"))
                    console.log('Count of props for Timeseires do not match; smallest common denominator used')
 
                }



                // ############################### end get corresponding properties ###############################
                // ############################### start calculation ###############################
                if(this.config.propLocation != "constValue"){

                    for(let propPair of correspondingProps){

                        let key : string = this.getNewPropName(this.config.propName, propPair[0])

                        for(let feature of geoJSON.features){

                            this.checkPropInObj_inplace([propPair[0], propPair[1]], feature)

                            if(feature.properties[propPair[0]] == null || feature.properties[propPair[1]]==null){

                                feature.properties[key] = null
    
                            }
                            else{
                                this.calcFuncs_inplace[this.config.action](
                                    feature,
                                    propPair[0], 
                                    propPair[1], 
                                    key,
                                    this.config.roundOption,
                                    offSetGeoJSON,
                                )
                            }
                        }
                    }
                }
                

                if(this.config.propLocation == "constValue"){

                    for(let prop of propNames1){

                        let key : string = this.getNewPropName(this.config.propName, prop)

                        for(let feature of geoJSON.features){

                            this.checkPropInObj_inplace([prop], feature)

                            if(feature.properties[prop] == null){

                                feature.properties[key] = null
                            }
                            else{
                                this.constantCalcFuncs_inplace[this.config.action](
                                    feature,
                                    prop,
                                    this.config.constantValue,
                                    key,
                                    this.config.roundOption
                                )
                            }
                        }                        
                    }

                }
                // ############################### end calculation ###############################
            }
            // ###############################                ###############################
            // ############################### end timeseries ###############################
            // ###############################                ###############################


            msg.payload = JSON.parse(JSON.stringify(geoJSON))

            send(msg)

            let info: any = { fill: "green", shape: "dot", text: "GeoJSON file successfully created." };
            this.status(info)
            done();
        }
        // ToDo 2: if the offSet prop is in another file, the geometries of the features need to be the same. maybe add identifier. A separately implemented JOIN-Node is better.
        getNewPropName(newPropName: string, oldPropName:string){

            let result = newPropName

            let time : string = oldPropName.slice(oldPropName.lastIndexOf('_'), oldPropName.length)

            result += time

            return result
        }

        getCorrespondingProps(propNames1 : any, propNames2:any){
            
            let result : any = []


            for(let i in propNames1){

                let time: any = propNames1[i].split('_')[propNames1[i].split('_').length-1]
                time = time.split('.')[time.split('.').length-1]

                for(let j in propNames2){

                    let timeOtherProp = propNames2[j].split('_')[propNames2[j].split('_').length-1]
                    timeOtherProp = timeOtherProp.split('.')[timeOtherProp.split('.').length-1]

                    if(time == timeOtherProp){
    
                        result.push([propNames1[i], propNames2[j]])

                    }
                }
            }

            return result
        }

        checkPropInObj_inplace(propKeys: Array<string>, feature:any){

            for(let propKey of propKeys){

                if(!(propKey in feature.properties)){

                    feature.properties[propKey] = null
                }
            }

        }

        
        calcFuncs_inplace: any = {
            subtract : function(feature:any, propMinuend:any, propSubtrahend:any, newPropName:string, roundOption:boolean ,offSetGeoJSON:any = null){
            
                if(offSetGeoJSON == null){
                        // check if feature actually has both properties:

                        if(roundOption){
                            feature.properties[newPropName] =  round(parseFloat(feature.properties[propMinuend]) - parseFloat(feature.properties[propSubtrahend]),2)
                        }
                        else{
                            feature.properties[newPropName] =  parseFloat(feature.properties[propMinuend]) - parseFloat(feature.properties[propSubtrahend])
                        }
    
                }
    
                if(offSetGeoJSON != null){
    
    
                        let featureGeometry: any = createGeometry(feature)
    
                        for(let offSetFeature of offSetGeoJSON.features){
    
                            let offSetGeometry: any = createGeometry(offSetFeature)
    
                            if(turf.booleanEqual(featureGeometry, offSetGeometry)){
                                if(roundOption){
                                    feature.properties[newPropName] =  round(parseFloat(feature.properties[propMinuend]) - parseFloat(feature.properties[propSubtrahend]),2)
                                }
                                else{
                                    feature.properties[newPropName] = parseFloat(feature.properties[propMinuend]) - parseFloat(offSetFeature.properties[propSubtrahend])
                                }
                            }
                        }
                }
            },
            add : function (feature:any, propSummand1:any, propSummand2:any, newPropName:string,roundOption:boolean ,offSetGeoJSON:any = null){
            
                if(offSetGeoJSON == null){
    
                    if(roundOption){
                        feature.properties[newPropName] = round(parseFloat(feature.properties[propSummand1]) + parseFloat(feature.properties[propSummand2]),2)

                    }
                    else{
                        feature.properties[newPropName] = parseFloat(feature.properties[propSummand1]) + parseFloat(feature.properties[propSummand2])
                    }
    
                    
                }
    
                if(offSetGeoJSON != null){
    
    
                    let featureGeometry: any = createGeometry(feature)

                    for(let offSetFeature of offSetGeoJSON.features){

                        let offSetGeometry: any = createGeometry(offSetFeature)

                        if(turf.booleanEqual(featureGeometry, offSetGeometry)){
                            if(roundOption){
                                feature.properties[newPropName] = round(parseFloat(feature.properties[propSummand1]) + parseFloat(feature.properties[propSummand2]),2)
        
                            }
                            else{
                                feature.properties[newPropName] = parseFloat(feature.properties[propSummand1]) + parseFloat(feature.properties[propSummand2])
                            }
                        }
                    }
                
                }
            },
            multiply : function (feature: any, propMultiplier1:any, propMultiplier2: any, newPropName:string,roundOption:boolean ,offSetGeoJSON:any = null){

                if(offSetGeoJSON == null){

                    if(roundOption){
                        feature.properties[newPropName] = round(parseFloat(feature.properties[propMultiplier1]) * parseFloat(feature.properties[propMultiplier2]),2)

                    }
                    else{
                        feature.properties[newPropName] = parseFloat(feature.properties[propMultiplier1]) * parseFloat(feature.properties[propMultiplier2])

                    }
                }
    
                if(offSetGeoJSON != null){
    
    
                        let featureGeometry: any = createGeometry(feature)
    
                        for(let offSetFeature of offSetGeoJSON.features){
    
                            let offSetGeometry: any = createGeometry(offSetFeature)
    
                            if(turf.booleanEqual(featureGeometry, offSetGeometry)){
                                if(roundOption){
                                    feature.properties[newPropName] = round(parseFloat(feature.properties[propMultiplier1]) * parseFloat(feature.properties[propMultiplier2]),2)
            
                                }
                                else{
                                    feature.properties[newPropName] = parseFloat(feature.properties[propMultiplier1]) * parseFloat(feature.properties[propMultiplier2])
            
                                }                            
                            }
                        }
                }
    
            },
            divide : function(feature: any, propNumerator: string, propDenominator: string, newPropName:string, roundOption:boolean, offSetGeoJSON:any = null){

                if(offSetGeoJSON == null){
                    if(roundOption){
                        feature.properties[newPropName] = round(parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator]),2)

                    }
                    else{
                        feature.properties[newPropName] = parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])
                    }
                }
    
                if(offSetGeoJSON != null){
        
                    let featureGeometry: any = createGeometry(feature)

                    for(let offSetFeature of offSetGeoJSON.features){

                        let offSetGeometry: any = createGeometry(offSetFeature)

                        if(turf.booleanEqual(featureGeometry, offSetGeometry)){
                            if(roundOption){
                                feature.properties[newPropName] = round(parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator]),2)
        
                            }
                            else{
                                feature.properties[newPropName] = parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])
                            }                        
                        }
                    }
                }
            },
            calcShare: function(feature: any, propNumerator: string, propDenominator: string, newPropName:string,roundOption:boolean, offSetGeoJSON:any = null){

                if(offSetGeoJSON == null){
                    if(roundOption){
                        
                        let num: number = parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])*100

                        feature.properties[newPropName] = round(num,2)
                        
                    }
                    else{
                        feature.properties[newPropName] = parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])*100
                    }                        
                }
    
                if(offSetGeoJSON != null){
                    
                    let featureGeometry: any = createGeometry(feature)

                    for(let offSetFeature of offSetGeoJSON.features){

                        let offSetGeometry: any = createGeometry(offSetFeature)

                        if(turf.booleanEqual(featureGeometry, offSetGeometry)){
                            if(roundOption){
                                feature.properties[newPropName] = round(parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])*100,2)
        
                            }
                            else{
                                feature.properties[newPropName] = parseFloat(feature.properties[propNumerator])/parseFloat(feature.properties[propDenominator])*100
                            }                           
                        }
                    }
                    
                }
    
            },
            divideArea: function(feature: any, propNumerator: string, propDenominator: string, newPropName:string, roundOption:boolean,offSetGeoJSON:any = null){


                let featureGeometry: any = createGeometry(feature)
                let area:number = turf.area(featureGeometry) / 10**6

                if(roundOption){
                    feature.properties[newPropName] = round(feature.properties[propNumerator]/area,2)

                }
                else{
                    feature.properties[newPropName] = feature.properties[propNumerator]/area 
                }
            }
        }

        constantCalcFuncs_inplace :any = {
            subtract: function(feature:any, propMinuend:any, propSubtrahend:any, newPropName:string, roundOption:boolean){


                if(roundOption){
                    let num: number = parseFloat(feature.properties[propMinuend]) - parseFloat(propSubtrahend)
                    feature.properties[newPropName] = round(num,2)
                }
                else{
                    feature.properties[newPropName] = parseFloat(feature.properties[propMinuend]) - parseFloat(propSubtrahend)
                }
            },
            add: function(feature: any, propSummand1:any, propSummand2:any, newPropName:string,roundOption:boolean){
                if(roundOption){
                    feature.properties[newPropName] = round(parseFloat(feature.properties[propSummand1]) + parseFloat(propSummand2),2)

                }
                else{
                    feature.properties[newPropName] = parseFloat(feature.properties[propSummand1]) + parseFloat(propSummand2)
                }
            },
            multiply: function (feature: any, propMultiplier1: any, multiplier2:any, newPropName:string,roundOption:boolean){

                if(roundOption){
                    feature.properties[newPropName] = round(parseFloat(feature.properties[propMultiplier1]) * parseFloat(multiplier2),2)

                }
                else{
                    feature.properties[newPropName] = parseFloat(feature.properties[propMultiplier1]) * parseFloat(multiplier2)
                }    
            },
            divide: function(feature: any, propNumerator: any, Denominator:any, newPropName:string,roundOption:boolean){

                if(roundOption){
                    feature.properties[newPropName] = round(parseFloat(feature.properties[propNumerator]) / parseFloat(Denominator),2)

                }
                else{
                    feature.properties[newPropName] = parseFloat(feature.properties[propNumerator]) / parseFloat(Denominator)

                }
            }
        }
        
  }

    RED.nodes.registerType("geojson-value-offset", GeojsonValueOffsetNode);
}