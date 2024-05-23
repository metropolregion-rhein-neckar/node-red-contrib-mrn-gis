import * as geojson from 'geojson'
import * as turf from '@turf/turf'
import { stringReplaceAll } from 'node-red-typescript-essentials/util'


export function  createGeometry (feature:any){

    let geometryArray = [];

    switch(feature.geometry.type){
        case "Point":
            geometryArray.push(turf.point(feature.geometry.coordinates))
            break;
        case "LineString":
            geometryArray.push(turf.lineString(feature.geometry.coordinates))
            break;
        case "Polygon":
            geometryArray.push(turf.polygon(feature.geometry.coordinates))
            break;
        case "MultiPoint":
            for(const point of feature.geometry.coordinates){
                geometryArray.push(turf.point(point))
            }
            break;
        case "MultiLineString":
            for(const lineString of feature.geometry.coordinates){
                geometryArray.push(turf.multiLineString(lineString))
            }
            break;
        case "MultiPolygon":
            for(const polygon of feature.geometry.coordinates){
                geometryArray.push(turf.polygon(polygon))
            }
            break;
        
    }

    return geometryArray
}


export function getTimeseriesKeys(geoJSON:any, propName:any){
    // Righ now this is only needed for 
    let res: any = []

    for(let feature of geoJSON.features){

        for(let key in feature.properties){

            let objKey: any;
            if(key.includes('_')){
                objKey = key.slice(0,  key.lastIndexOf("_"))
            }
            else{
                objKey = key
            }


            if(objKey == propName){
                res.push(key)

            }
        }
    }

    // remove duplicates
    res  = Array.from(new Set(res))
    
    return res
}


export function propertyNameReplaceChars(geojson:any, original:string, replacement:any):any {

    let result = JSON.parse(JSON.stringify(geojson))

    for(let feature of result.features){
        
        let props_filtered:any ={}

        for(let key in feature.properties){

            let newKey: string = stringReplaceAll(key, original, replacement)

            let suffix = 0
            while(newKey in props_filtered) {
                newKey += suffix
                suffix++
            }

            props_filtered[newKey] = feature.properties[key]

        }

        feature.properties = props_filtered

    }

    return result

}


export function propertyNamesToLowercase(geojson: any): any {

    // Create a copy of the input GeoJSON:
    let result = JSON.parse(JSON.stringify(geojson))

    for (let feature of result.features) {

        let props_filtered: any = {}

        for (let key in feature.properties) {
            
            let newKey = key.toLowerCase()

            // TODO: 2 Can we guarantee here that the relation between field names and values remains unchanged?
            let suffix = 0
            while(newKey in props_filtered) {
                newKey += suffix
                suffix++
            }

            props_filtered[newKey] = feature.properties[key]
        }
        
        feature.properties = props_filtered        
    }

    return result
}




export function separateByGeomType(geojson : geojson.FeatureCollection) {

    let result = { 'no_geom' : {"type": "FeatureCollection", "features": Array<geojson.Feature>()}} as any

    for (let feature of geojson.features) {

        if (!('geometry' in feature)) {
            
            result.no_geom.features.push(feature)
            continue
        }


        let geom = feature.geometry

        if (!(geom.type in result)) {

            result[geom.type] = {"type": "FeatureCollection", "features": Array<geojson.Feature>()}
        }

        result[geom.type].features.push(feature)
    }

    return result

}



export function toMultiGeometries(geojson: geojson.FeatureCollection): any {

    // Create copy:
    let result = JSON.parse(JSON.stringify(geojson)) as any

    let singleTypes = ['Point', 'LineString', 'Polygon']

    for (let feature of result.features) {

        // TODO: 2 What to do with features that have no geometry?
        if (!('geometry' in feature)) {
            continue
        }

        let geom = feature.geometry

        
        if (singleTypes.includes(geom.type)) {

            
            geom.coordinates = [geom.coordinates]
            geom.type = "Multi" + geom.type
        }
    }

    return result

}


