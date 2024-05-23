%%TOC%%

In this tutorial, you'll learn how to use Node-RED and our extension nodes to extract geodata from OpenStreetMap and publish the extracted data set as a WMS/WFS service using GeoServer. As an example, we are going to work with the bicycle routes intersecting the bounding box of the German state of Baden-Württemberg.

# Overview

Before we dive into the details, let us get ourselves an overview over the required actions and the nodes we need to implement them. We can break down our task into roughly three steps:

1. Downloading the data set from OpenStreetMap using the Overpass API

2. Preparing the downloaded data set for publishing with GeoServer

3. Uploading the prepared data set to GeoServer to publish it as WMS/WFS

For each sub-task, we need one or several nodes. 


# Downloading the data set from OpenStreetMap using the Overpass API

This step requires two nodes: *osm-overpass-download* and *osm-overpass-to-geojson*. *osm-overpass-download* is the first node in our flow. It will download the data we are interested in from an OpenStreetMap Overpass API endpoint and write it to a file on our Node-RED server in the original Overpass API response format. 


## Configuration options of the *osm-overpass-download* node
In order to get the node to do what we want, the following configuration parameters must be set:

*Temp Dir*: The data type of this parameter is a so-called *configuration node*. In Node-RED, configuration nodes are special nodes that are both "global" and "invisible". Configuration nodes are not part of any flow, but they can be referenced as a field in another node's configuration. This way, the other node's configuration can be extended with the settings of the configuration node. Configuration nodes allow settings to be shared between multiple other nodes, so that the settings only need to be entered once. Whenever a setting of a configuration nodes is changed, the change automatically applies to all nodes that reference that refer to that configuration node.

In our case, the configuration node specifies the path to a directory in which the output files of a node are stored if no output path is explicitly specified by the user. The usual and recommended practice is to use the same configuration node - i.e. the same temporary folder - for all nodes that write output files and have a "Temp Dir" configuration parameter.


*Overpass Endpoint URL*: In this field, we enter the URL of the OSM Overpass API endpoint we want to use to download our data. Usually, we can just keep the preconfigured default (https://overpass-api.de/api/interpreter).

*Query Bounding Box*: This parameter specifies the spatial extent for which we want to download data from Overpass. Only features that intersect the specified extent will be contained in the result set. The notation for the extent is "[min lat], [min lon], [max lat], [max lon]" (without the quotes and square brackets).

*Query tags*: This field is the core piece of our Overpass query. We use it to specify the OSM tags - and optionally, expected values - by which we want the query result to be filtered.

*Output File Path*: This field specifies the file system path where the file that contains the query result should be saved. If we leave this field empty, the file will be given a random name and stored in the temporary directory.

## Behaviour of the osm-overpass-download node

The Overpass download node does not read and process the content of an incoming message. Incoming messages with any content just start the download of OpenStreetMap data as specified in the node's configuration. After the download has finished, the result is written to the specified output file in the original Overpass JSON response format in which it was received from the Overpass endpoint. 

The file system path to this output file is then sent to the sucessor node(s) as the payload of the outgoing message. This behaviour of writing results to a file and communicating that file's location to the next node(s) can be found in many of the nodes in this Node-RED extension. 

// TODO: Move this to general documentation

We decided for this solution instead of directly sending the result to the next node(s) as the payload of the outgoing message for multiple reasons:

- Error resilience / "safe milestone" capability: If the output of a node is written to a file, it can be considered relatively safe from program errors. If we passed the data to the next node in-memory as a message payload, there would always be the risk that data (which might have taken a long time to download or generate) is lost if an un-handled error occurs. If a flow is aborted for whatever reason, we can resume it at the point where it stopped by injecting the intermediate result of the last successful step from the respective file instead of having to restart the entire flow from the beginning. This can save a lot of time.

- Simplicity: The APIs of many libraries, like e.g. GDAL, are designed to read/write data from/to files. If we wanted to pass around intermediate results as in-memory message payloads, we would need to implement a solution to encapsulate arbitrary file contents (which are often binary "blobs" like e.g. in the cases of raster images, Shapefile, GeoPackage an other file formats) in JavaScript objects, and also write additional code to connect the file-based I/O function calls of the libraries to this mechanism.

- Progress Monitoring / transparency: Storing intermediate results in files provides us with an easy way to verify intermediate results.

- Compatibility with PyNodeRed: PyNodeRed is a Python module that allows developers to implement Node-RED extensions in Python. Node-RED node implementations that are created with PyNodeRed run on a separate web server process and communicate with the actual Node-RED server  over HTTP, even if both servers run on the same machine. This HTTP communication can cause problems if message payloads are too large. By just passing around file path strings instead of the actual data, these problems can be solved. We do currently not use PyNodeRed, but we used it for a short time in the past, before we switched to TypeScript to write our custom nodes. The file-based data passing system allows us to again integrate PyNodeRed-based nodes into our flows at any time in case we wanted to do so.


# Converting the Overpass API response file to GeoJSON with the *osm-overpass-to-geojson* node

Before the data downloaded through Overpass can be processed further, it needs to be converted to GeoJSON. Most of our Node-RED extension's nodes use GeoJSON as the format to exchange and operate on GeoData. The conversion is done by the *osm-overpass-to-geojson* node. It has no special configuration parameters, apart from the *Output path* parameter, which works in the same way as for the *osm-overpass-download* node.


# Converting from GeoJSON to GeoPackage with the *geojson-to-gpkg* node

The *geojson-to-gpkg* node takes a path to a GeoJSON files as input message payload, writes the data in the GeoJSON file to a GeoPackage file and sends the file path to the created GeoPackage file as payload of the outgoing message. Apart from the known *Temp dir* and *Output file path* settings, it has two task-specific parameters: *Layer Name Prefix* and *Convert single- to multigeometries*. Both have to do with a major difference between the ways how the GeoJSON format and the GeoPackage format organize data: 

GeoJSON does not have a concept of "layers", and it supports mixed geometries: A GeoJSON document can contain features with different geomety types (Point, LineString, Polygon etc.) in one file. GeoPackage, on the other hand, *does* organize data in layers, and one layer in a GeoPackage file can only contain features with one and the same geometry type. This means that for each geometry type that occurs in a GeoJSON file, at least one separate layer must be created in the GeoPackage file.

The *geojson-to-gpkg* node groups the features in the GeoJSON file into multiple "buckets", based on their geometry type (one "bucket" with all "Point" features, one with all "LineString" features, and so on). Then it creates a GeoPackage layer with matching geometry type for each of the "buckets" and writes the features from the "buckets" to the layers. The individual layers are named by their *geometry type*, i.e. "Points", "LineStrings", "Polygons", and so on. 

## The "Layer Name Prefix" configuration parameter

The "Layer Name Prefix" parameter is a string which is added as a prefix to the names of the GeoPackage layers, which otherwise only consist of the names of their respective geometries. For example, if the layer name prefix is "cycle_routes", a layer which would otherwise be named "Points" is now named "cycle_routes_Points".

## The "Convert single- to multigeometries" parameter

In oder to minimize the number of layers for different geometries in the GeoPackage file, the node converts all "single" geometries (i.e. "Point", "Line" and "Polygon") to their "multi" equivalents ("MultiPoint", "MultiLineString" and "MultiPolygon"). This way, the features with (formerly) "single" geometries of one type (e.g. "Point") and the features with the respective "multi" type equivalent geometry (in this case, "MultiPoint") end up together in the same layer and no "Points" layer is needed any more in addition to the "MultiPoints" layer.


# Publishing the GeoPackage to GeoServer (*geoserver-publish* node)

The *geoserver-publish* node expects the file path to a GeoPackage file as the payload of incoming messages. It uploads the specified GeoPackage file to a GeoServer instance, which will automatically publish the contained layers as WMS/WFS services.

The *geoserver-publish* node has two configuration settings: *GeoServer Config Node* and *Workspace*. As its name says, *GeoServer Config Node* is a reference to a GeoServer config node. If such a node already exists in the flow, we can simply select it. If not, we must create one.

## Configuration parameters of the *geoserver-config* node

*geoserver-config* nodes have the following configuration parameters:

- *GeoServer Base URL*: The URL of the GeoServer HTTP(S) endpoint to use
- *Username*: The GeoServer user name to use
- *Password* The GeoServer password to use

## The "Workspace" parameter

The *Workspace* parameter specifies to workspace in which the uploaded GeoPackage data set should be stored.