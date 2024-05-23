// IN:  Path to OSM Overpass JSON file
// OUT: File path to the GeoPackage file written by the node

import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import { getAbsoluteFilePath } from 'node-red-typescript-essentials/tempDirUtil'
import * as fs from 'fs'
import * as gdalnext from 'gdal-async'


// TODO: Move geojson-utils to its own library?
import { propertyNamesToLowercase, separateByGeomType, toMultiGeometries, propertyNameReplaceChars } from '../../geojson-utils';



module.exports = function (RED: any) {

    class GeoJsonToGpkgConfig  {

        constructor(            
            public outfilePath: string,
            public layerNamePrefix: string,
            public convert: boolean,
            public lowerCaseOption: boolean,
            public removeSpaces: boolean
        ) {

        }
    }


    class GeoJsonToGeoPackageNode extends AbstractNode {

        constructor(public config: GeoJsonToGpkgConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }

        fieldTypesMapping: any = {
            "integer": gdalnext.OFTInteger,
            "number": gdalnext.OFTReal,
            "string": gdalnext.OFTString,
            "boolean": gdalnext.OFTInteger
        }

        geometryTypesMapping: any = {
            "Point": gdalnext.wkbPoint,
            "LineString": gdalnext.wkbLineString,
            "Polygon": gdalnext.wkbPolygon,
            "MultiPoint": gdalnext.wkbMultiPoint,
            "MultiLineString": gdalnext.wkbMultiLineString,
            "MultiPolygon": gdalnext.wkbMultiPolygon
        }


        // TODO: 3 Move this to a library file?
        buildJsonSchema(geojson: any): any {

            let schema: any = { "properties": {}, "type": "object" }


            for (let feature of geojson.features) {

                if (!('properties' in feature)) {
                    continue
                }

                let props = feature.properties

                for (let key in props) {

                    let value = props[key]

                    //############### BEGIN Figure out type string ################                    
                    let typeString = (typeof value) as string

                    if (value == null) {
                        typeString = "null"
                    }

                    if (typeString == "number" && Number.isInteger(value)) {
                        typeString = "integer"
                    }
                    //############### END Figure out type string ################


                    if (!(key in schema.properties)) {
                        schema.properties[key] = { "type": typeString }
                    }
                    else {

                        let prevTypeString = schema.properties[key].type

                        // If the detected type changes between different features, use the less strict one:
                        if (typeString == prevTypeString || typeString == "null") {
                            // Nothing to do here, but the 'else if' is required to prevent the 'else'
                        }
                        else if (prevTypeString == "null") {
                            schema.properties[key].type = typeString
                        }
                        else if (typeString == "integer" && prevTypeString == "number") {
                            // Nothing to do here, but the 'else if' is required to prevent the 'else'
                        }
                        else if (typeString == "number" && prevTypeString == "integer") {
                            schema.properties[key].type = "number"
                        }
                        else if (typeString == "string") {
                            schema.properties[key].type = "string"
                        }
                        else if (typeString == "boolean" && prevTypeString == "string") {
                            schema.properties[key].type = "string"
                            //ToDo: change this?
                            feature.properties[key] = value.toString()
                        }
                        else {
                            console.log("ERROR: Inconsistent Schema")
                            console.log(prevTypeString + " " + typeString)
                            return null
                        }
                    }
                }
            }
            return schema
        }


        onInput(msg: any, send:any, done:any) {

            // Reset status:
            this.status(new NodeStatus("Converting GeoJSON to GeoPackage ..."))

            setTimeout(() => {

                let geojson = undefined
                
                if (typeof msg.payload == "object") {
                    geojson = msg.payload
                }
                else if (typeof msg.payload == "string") {
                    try {
                        geojson = JSON.parse(msg.payload)
                    }
                    catch(e) {
                        this.status(new NodeStatus("ERROR: Failed to parse input message string as JSON"))
                        return
                    }
                }
                else {
                    this.status(new NodeStatus("ERROR: Invalid input message type: " + typeof msg.payload))
                    return
                }

                


                if(this.config.removeSpaces){
                    geojson = propertyNameReplaceChars(geojson, " ", "")
                }
                if (this.config.lowerCaseOption) {
                    geojson = propertyNamesToLowercase(geojson)
                }
                // Transform all geometries to their "Multi"-equivalent. This is done to minimize 
                // the number of required layers in the GPKG file, since we need a separate layer for
                // each geometry type:
                if (this.config.convert) {
                    geojson = toMultiGeometries(geojson)
                }

                // Separate the features by their geometry type, since we need to create a separate layer
                // in the GPKG file for each geometry type:
                let separated = separateByGeomType(geojson)



                let outfilePath = getAbsoluteFilePath(this.config.outfilePath, ".gpkg")

                // Delete existing file:    
                if (fs.existsSync(outfilePath)) {
                    fs.unlinkSync(outfilePath)
                }



                // Create driver:
                let driver = gdalnext.drivers.get("GPKG")

                // Create dataset:
                let dataset = driver.create(outfilePath)
                let srs = new gdalnext.SpatialReference.fromEPSG(4326)


                for (let key in separated) {

                    if (!(key in this.geometryTypesMapping)) {
                        console.log("Unknown geometry type: " + key)
                        continue
                    }

                    let fc = separated[key]

                    let schema = this.buildJsonSchema(fc)

                    if (schema == null) {
                        console.log("Failed to build schema definition")
                        continue
                    }

                    //############### BEGIN Set layer name ################

                    // The layer name is the geometry type, ...
                    let layerName = key

                    // ... potentially prefixed by a used-defined string:
                    if (this.config.layerNamePrefix != "") {
                        layerName = this.config.layerNamePrefix + "_" + layerName
                    }
                    //############### END Set layer name ################


                    let layer = dataset.layers.create(layerName, srs, this.geometryTypesMapping[key])

                    // See https://contra.io/node-gdal-next/classes/gdal.Feature.html



                    //############### BEGIN Configure layer fields based on JSON schema of the GeoJSON geometry #############
                    for (let fieldname in schema.properties) {
                        let fd = schema.properties[fieldname]

                        if (fd.type in this.fieldTypesMapping) {
                            layer.fields.add(new gdalnext.FieldDefn(fieldname, this.fieldTypesMapping[fd.type]))
                        }
                    }
                    //############### END Configure layer fields based on JSON schema of the GeoJSON geometry #############


                    //################### BEGIN Write features ####################
                    for (let feature of fc.features) {

                        let gdalFeature = new gdalnext.Feature(layer)

                        for (let fieldname in schema.properties) {
                            let fd = schema.properties[fieldname]

                            let value = feature.properties[fieldname]

                            if (value != null) {
                                gdalFeature.fields.set(fieldname, value)
                            }
                        }

                        let geom = gdalnext.Geometry.fromGeoJson(feature.geometry)

                        gdalFeature.setGeometry(geom)

                        layer.features.add(gdalFeature)
                    }
                    //################### END Write features ####################

                    layer.flush()
                }

                // Send outgoing message:
                msg.payload = outfilePath

                send(msg)

                let info: any = { fill: "green", shape: "dot", text: "GeoPackage file successfully created." };
                this.status(info)
                done();
            }, 100);


        }
    }

    RED.nodes.registerType("geojson-to-gpkg", GeoJsonToGeoPackageNode);
}