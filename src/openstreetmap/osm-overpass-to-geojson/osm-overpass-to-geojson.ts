// IN:  Path to OSM Overpass JSON file
// OUT: GeoJSON object as message payload

import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Fill } from 'node-red-typescript-essentials/node_status'
import * as fs from 'fs'
import * as turf from '@turf/turf'


module.exports = function (RED: any) {

    class OverpassResult {

        removed_count: any = { "node": 0, "way": 0, "relation": 0 }
        elements_count: any = { "node": 0, "way": 0, "relation": 0 }

        elements_by_id: any = {}

        all_invalid_elements_ids: Array<string> = []

        num_closed_ways = 0
        num_closed_rings = 0


        constructor(private overpass_json: any) {

            //############## BEGIN Build 'elements by id' dictionary and collect some statistics ############
            this.elements_by_id = {}

            for (let element of this.overpass_json.elements) {
                this.elements_by_id[element.id] = element
                this.elements_count[element.type]++
            }
            //############## END Build 'elements by id' dictionary and collect some statistics ############

            // Reset list of invalid elements:
            this.all_invalid_elements_ids = []

            this.validate_and_fix()

            if (this.all_invalid_elements_ids.length > 0) {
                console.log(this.all_invalid_elements_ids.length + " invalid elements found.")
            }


            this.build_geometries()
        }


        find_containing_polygons(poly1: any, polygons: any): Array<any> {

            let result = Array<any>()

            let turfPoly1 = turf.polygon([poly1])

            for (let poly2 of polygons) {
                if (poly1 == poly2) {
                    continue
                }

                let turfPoly2 = turf.polygon([poly2])

                if (turf.booleanContains(turfPoly2, turfPoly1)) {
                    result.push(poly2)
                }
            }

            return result
        }


        get_as_geojson(wikilink:boolean, editlink:boolean): any {

            this.num_closed_ways = 0
            this.num_closed_rings = 0

            let geojson = { "type": "FeatureCollection", "features": Array<any>() }

            let elements = Object.values(this.elements_by_id) as Array<any>


            //########################### BEGIN Loop to process all elements in the result ###########################
            for (let element of elements) {

                // Do not add an element to the result is that element is already part of a way or relation:
                if (element.is_part_of_way || element.is_part_of_relation) {
                    continue
                }

                //################# BEGIN Get geometry for element #################
                let geometry = null

                if (element.type == 'node') {
                    geometry = this.get_geometry_from_node(element)
                }
                else if (element.type == 'way') {
                    geometry = this.get_geometry_from_way(element)
                }
                else if (element.type == 'relation') {
                    geometry = this.get_geometry_from_relation(element)
                }
                else {
                    console.log("ERROR: Unknown element type")
                    console.log(element)
                }
                //################# END Get geometry for element #################


                //################ BEGIN If a geometry was constructed, add it to the result GeoJSON object #############
                if (geometry != null) {

                    let properties: any = {}

                    if ('tags' in element) {
                        properties = element.tags
                    }

                    properties.osm_id = element.id
                    properties.osm_type = element.type

                    // NOTE: We have left out the conversion of property names to lowercase which exists in the
                    // Python version here.

                    // Format Wikipedia Link
                    if(wikilink){
                        properties = this.format_wiki_link(properties)
                    }
                        
                    if(editlink){
                        properties = this.format_editor_link(properties)
                    }
                    


                    let feature = { "type": "Feature", "geometry": geometry, "properties": properties }

                    geojson.features.push(feature)
                }

                //################ END If a geometry was constructed, add it to the result GeoJSON object #############
            }
            //########################### END Loop to process all elements in the result ###########################

            console.log("# closed ways: " + this.num_closed_ways)
            console.log("# closed rings: " + this.num_closed_rings)

            return geojson
        }

        format_editor_link(properties:any){
            let result = JSON.parse(JSON.stringify(properties))

            let baseUrl = "https://www.openstreetmap.org/"

            baseUrl += result.osm_type
            baseUrl += '/'+ result.osm_id.toString()

            result.editLink = baseUrl
            result.tutorialLink = "https://learnosm.org/de/beginner/"

            return result
        }

        format_wiki_link(properties:any){

            if("wikipedia" in properties && properties.wikipedia != undefined){
                
                let wiki_url: any = properties.wikipedia

                // check if country-code in url
                if(wiki_url.substring(0, 4).includes(':')){
                    wiki_url = wiki_url.split(':')[1]
                }
                
                console.log(wiki_url)
                wiki_url = wiki_url.replace(" ", "_")
                wiki_url = "https://de.wikipedia.org/wiki/" + wiki_url
                
                properties.wikipedia = wiki_url
            }

            return properties
        }

        get_geometry_from_node(node: any) {
            return { 'type': 'Point', 'coordinates': node['coordinates'] }
        }


        get_geometry_from_way(way: any) {
            let geom_type = "LineString"
            let coordinates = way.coordinates

            if (coordinates.length == 0) {
                console.log("Zero-length way")
                return null
            }

            let is_closed = (way.coordinates[0] == way.coordinates.slice(-1)[0])

            // # TODO: 2 Add remaining checks for area-ness of a way
            if (is_closed) {

                geom_type = "Polygon"
                coordinates = [coordinates]
                this.num_closed_ways++
            }

            return { 'type': geom_type, 'coordinates': coordinates }
        }


        get_geometry_from_multilinestring_relation(relation: any) {
            return { 'type': 'MultiLineString', 'coordinates': this.get_joined_ways(relation) }
        }


        get_geometry_from_multipolygon_relation(relation: any) {

            //############### BEGIN Get joined ways and create Shapely polygons from them ############
            let joined_coords = this.get_joined_ways(relation)

            let shapely_polygons = Array<any>()

            //console.log("# Joined coords: " + joined_coords.length)

            for (let coords of joined_coords) {

                // Check if first element is same as last element:
                if (coords[0] != coords.slice(-1)[0]) {
                    //console.log("Not a closed ring!")
                    //console.log(coords[0] + " - " + coords.slice(-1)[0])
                    continue
                }


                this.num_closed_rings++
               
                shapely_polygons.push(coords)
            }
            //############### END Get joined ways and create Shapely polygons from them ############




            //############################### BEGIN Ring grouping and multipolygon assembly #############################

            let geojson_multipolygon_coords = Array<any>()

            while (shapely_polygons.length > 0) {

                let current_outer = null

                //############## BEGIN Find next polygon that is not contained in another polygon ###########
                for (let poly of shapely_polygons) {

                    let enclosing_polygons = this.find_containing_polygons(poly, shapely_polygons)

                    // If the current polygon is not enclosed by another polygon, set it as the new outer polygon:
                    if (enclosing_polygons.length == 0) {
                        current_outer = poly
                        break
                    }
                }
                //############## END Find next polygon that is not contained in another polygon ###########

                if (current_outer == null) {
                    console.log("No more outer rings found!")
                    // # No more outer rings found:
                    break
                }


                // Start new polygon:
                let polygon_coords = Array<any>()

                // NOTE: Since we have not pushes Turf polygon instances to polygon_coords, we don't
                // need to extract the original geometry data from them:
                polygon_coords.push(current_outer)


                //############## BEGIN Find all rings that are contained *only* by the current outer ring. These are the holes. ###########

                // NOTE: "Hole in hole" situations are resolved automatically. 
                // A "hole in a hole" is another outer ring /polygon of its own, once the surrounding
                // has been removed from the list of unprocessed polygons

                let polygons_copy = [...shapely_polygons]

                for (let poly of polygons_copy) {
                    let enclosing_polygons = this.find_containing_polygons(poly, shapely_polygons)

                    if (enclosing_polygons.length == 1 && enclosing_polygons[0] == current_outer) {
                        // NOTE: Reversing the coordinates of holes is not required.

                        // TODO: Translate original Python code here

                        polygon_coords.push(poly)

                        // TODO: If any of these rings are tagged with anything different 
                        // from the relation being processed, continue using the ring as a hole, 
                        // but additionally issue an output polygon for this ring and its tags. 

                        // Remove hole polygon from the list of unprocessed polygons:
                        let index = shapely_polygons.indexOf(poly)
                        shapely_polygons.splice(index, 1)
                    }
                }

                //############## END Find all rings that are contained *only* by the current outer ring. These are the holes. ###########                

                // Remove current outer ring from list of remaining rings:
                let index = shapely_polygons.indexOf(current_outer)
                shapely_polygons.splice(index, 1)

                // Add assembled polygon (possible with holes) to the multipolygon:
                geojson_multipolygon_coords.push(polygon_coords)

            }

            if (geojson_multipolygon_coords.length > 0) {
                return { 'type': 'MultiPolygon', 'coordinates': geojson_multipolygon_coords }
            }

            //############################### END Ring grouping and multipolygon assembly #############################
        }


        get_geometry_from_relation(relation: any) {

            let relation_type = null

            try {
                relation_type = relation.tags.type
            }
            catch (e) {
                console.log(relation)
                return null
            }

            // When to consider a relation to represent a multipolygon?
            // https://cran.r-project.org/web/packages/osmdata/vignettes/osm-sf-translation.html
            // https://wiki.openstreetmap.org/wiki/Types_of_relation

            let is_multipolygon = false

            for (let member_ref of relation.members) {
                if (member_ref.role == 'outer' || member_ref.role == 'inner') {
                    is_multipolygon = true
                    break
                }
            }

            if (is_multipolygon) {
                return this.get_geometry_from_multipolygon_relation(relation)
            }
            else {
                return this.get_geometry_from_multilinestring_relation(relation)
            }
        }


        get_joined_ways(relation: any): Array<Array<any>> {

            let result = Array<any>()

            //############### BEGIN Collect ways #############
            let way_refs = []

            for (let member_ref of relation.members) {
                if (member_ref.type == 'way') {
                    way_refs.push(member_ref)
                }
            }
            //############### BEGIN Collect ways #############

            //# TODO: 3 Break while loop if there are still ways remaining, but the current ring can't be closed?

            while (way_refs.length > 0) {

                let joined_coords = Array<any>()

                //########### BEGIN Add first way to the ring ##############
                let first_ref = way_refs[0]
                joined_coords = joined_coords.concat(first_ref.coordinates)
                way_refs.splice(way_refs.indexOf(first_ref), 1)
                //########### END Add first way to the ring ##############


                //############################# BEGIN Loop to build a ring ############################
                while (joined_coords.length == 0 || joined_coords[0] != joined_coords.slice(-1)[0]) {

                    let match = null

                    //################### BEGIN Try to find a way that continues the unfinished ring ############
                    for (let way_ref of way_refs) {

                        // TODO: 4 "It is possible that in step RA-4 you find more than one candidate way to 
                        // add to one open end of your current ring. 
                        // In that case you might have to implement a backtracking algorithm - 
                        // first try one, and if that doesn't yield a valid multipolygon, then try another."

                        // Way matches in forward direction:

                        if (joined_coords.slice(-1)[0] == way_ref['coordinates'][0]) {
                            joined_coords = joined_coords.concat(way_ref['coordinates'])
                            match = way_ref
                            break
                        }

                        // Way matches in reverse direction:
                        else if (joined_coords.slice(-1)[0] == way_ref['coordinates'].slice(-1)[0]) {

                            let coords_copy = [...way_ref['coordinates']]
                            coords_copy = coords_copy.reverse()

                            joined_coords = joined_coords.concat(coords_copy)

                            match = way_ref
                            break
                        }
                    }
                    //################### END Try to find a way that continues the unfinished ring ############

                    if (match != null) {
                        let index = way_refs.indexOf(match)
                        way_refs.splice(index, 1)
                    }
                    else {
                        //# If no matching way was found, it is not possible to close the ring.
                        //# In this case, we abort here:
                        break
                    }
                }
                //############################# END Loop to build a ring ############################

                result.push(joined_coords)
            }

            return result
        }


        get_element_by_id(id: string): any {

            if (id in this.elements_by_id) {
                return this.elements_by_id[id]
            }
            else {
                return null
            }
        }


        validate_and_fix() {

            let invalid_elements_ids = []

            let elements = Object.values(this.elements_by_id) as Array<any>

            //###################### BEGIN Check data integrity ###################
            for (let element of elements) {
                //console.log(element)

                let el_type = element.type
                let el_id = element.id

                if (el_type == 'node') {
                    continue
                }
                else if (el_type == 'way') {

                    for (let node_id of element.nodes) {

                        let node = this.get_element_by_id(node_id)

                        if (node == null || node.type != 'node') {
                            invalid_elements_ids.push(el_id)
                            continue
                        }
                        else {
                            node.is_part_of_way = true
                        }
                    }
                }
                else if (el_type == 'relation') {

                    for (let member_ref of element.members) {

                        let member = this.get_element_by_id(member_ref.ref)

                        if (member == null) {
                            invalid_elements_ids.push(el_id)
                            continue
                        }
                        else {
                            member.is_part_of_relation = true
                        }

                    }
                }
            }

            //###################### END Check data integrity ###################        



            if (invalid_elements_ids.length > 0) {

                for (let id of invalid_elements_ids) {

                    if (!(id in this.elements_by_id)) {
                        continue
                    }

                    let element = this.elements_by_id[id]

                    if (element == null) {
                        continue
                    }

                    delete this.elements_by_id[id]

                    this.removed_count[element.type]++

                    this.all_invalid_elements_ids.push(id)
                }

                this.validate_and_fix()
            }
        }


        build_geometries() {

            let elements = Object.values(this.elements_by_id) as Array<any>

            // ############### BEGIN Build node geometries ###############
            for (let element of elements) {

                if (element.type != 'node') {
                    continue
                }

                element.coordinates = [element.lon, element.lat]
            }
            // ############### END Build node geometries ###############


            // ############### BEGIN Build way geometries ###############
            for (let element of elements) {

                if (element.type != 'way') {
                    continue
                }

                let coordinates = []

                for (let node_id of element.nodes) {
                    let node = this.get_element_by_id(node_id)

                    if (node == null) {
                        console.log("Missing node")
                    }
                    else {
                        coordinates.push(node.coordinates)
                    }
                }

                element.coordinates = coordinates
            }
            // ############### END Build way geometries ###############


            //############### END Build relation geometries ###############
            for (let element of elements) {

                if (element.type != 'relation') {
                    continue
                }

                for (let member_ref of element.members) {

                    if (member_ref.type == 'way') {

                        let way = this.get_element_by_id(member_ref.ref)

                        if (way == null) {
                            console.log("Missing way")
                        }
                        else {
                            member_ref.coordinates = way.coordinates
                        }
                    }
                }
            }

            //############### END Build relation geometries ###############
        }
    }
    class OverpassToGeojsonConfig  {

        constructor(            
            public wiki: boolean,
            public edit: boolean
        ) {

        }
    }

    class OverpassToGeojson extends AbstractNode {

        constructor(public config: OverpassToGeojsonConfig) {
            super(config, RED)

            this.on('input', this.onInput);
        }


        onInput(msg: any) {

            let infilePath = msg.payload

            if (!fs.existsSync(infilePath)) {
                this.status(new NodeStatus("ERROR: Input file not found: " + infilePath, Fill.red)) 
                return
            }

            //Not needed output of node changed to geojson in payload

            //let outfilePath = getAbsoluteFilePath(this.config.outfilePath, ".osm.geojson")

            // Test output file write before we start with the actual process:
            //if (!testFileWrite(outfilePath)) {
            //   this.status(new NodeStatus("Unable to write to file: " + outfilePath, Fill.red))
            //   return
           // }


            this.status(new NodeStatus("Converting to GeoJSON ..."))

            // NOTE: The timeout is required for the node status message to be displayed before the process starts.
            setTimeout(() => {
               try{

                let rawdata: any = fs.readFileSync(infilePath, 'utf8');

                let overpass_json = JSON.parse(rawdata) as any;

                let overpassResult = new OverpassResult(overpass_json)


                let result = overpassResult.get_as_geojson(this.config.wiki,this.config.edit)

                // ATTENTION: We do no longer pass GeoJSON between nodes as file references.
                // Instead, we send the GeoJSON object directly as the message payload

                // Send GeoJSON as message payload:
                msg.payload = result

                this.send(msg)
               }
               catch(e){
                this.status(new NodeStatus("ERROR: " + e, Fill.red))
               }

            }, 100);
        }
    }



    RED.nodes.registerType("osm-overpass-to-geojson", OverpassToGeojson);
}