import { AbstractNode } from "node-red-typescript-essentials/AbstractNode";
import { NodeStatus } from "node-red-typescript-essentials/node_status";
import axios from "axios";
const JSSoup = require("jssoup").default;
import { tryToRead } from "node-red-typescript-essentials/util";

// Out: GeoJSON object as payload
module.exports = function (RED: any) {
  class UVPNodeConfig {
    constructor(public api_url: string, public boundingBox: string, public boundingBox_type: string) {}
  }

  class UVPNode extends AbstractNode {
    constructor(public config: UVPNodeConfig) {
      super(config, RED);

      this.on("input", this.onInput);
    }

    async onInput(msg: any, send: any, done: any) {
      try {
        let page_count = 1;
        let geoJSON = { "type": "FeatureCollection", "features": Array<any>() };

        this.status(new NodeStatus("Start UVP request.."));

        let bbox = undefined;

        // read bounding box values from input
        if (this.config.boundingBox_type === "msg") {
          bbox = tryToRead(msg, this.config.boundingBox, undefined);
          if (bbox == undefined) {
            throw `msg.${this.config.boundingBox} does not exist.`;
          }
        } else {
          // this.config.boundingBox_type === "str"
          bbox = this.config.boundingBox;
        }

        let bboxParams = bbox.split(",");
        if (bboxParams.length != 4) {
          throw "Wrong bounding box format";
        }
        let [minLong, minLat, maxLong, maxLat] = bboxParams;

        while (true) {
          let url =
            this.config.api_url +
            `?q=datatype: default ranking:score x1:${minLat} x2:${maxLat} y1:${minLong} y2:${maxLong} coord:inside` +
            `&ingrid=1&detail=1&h=100&p=${page_count}`;

          let response = await axios.get(url);

          if (response == undefined) {
            throw "Download failed, response is undefined";
          }

          if (typeof response.data !== "string") {
            throw "Response not a string";
          }

          // Extracting data

          let soup = new JSSoup(response.data);
          let items = soup.findAll("item");

          for (let item of items) {
            let properties: any = {};

            properties["Titel"] = item.find("title").text;
            properties["Link"] = item.find("link").text;
            properties["Beschreibung"] = item.find("description").text;
            properties["Anbieter"] = item.find("ingrid:provider-name").text;
            properties["Partner"] = item.find("ingrid:partner-name").text;
            properties["Quelle"] = item.find("ingrid:source").text;
            properties["Zuletzt geändert"] = item.find("ingrid:last-modified").text;

            let spatialvalue = item.find("spatialValue").text.split(": ")[1];

            let lon_min = parseFloat(spatialvalue.split(", ")[0]);
            let lat_min = parseFloat(spatialvalue.split(", ")[1]);
            let lon_max = parseFloat(spatialvalue.split(", ")[2]);
            let lat_max = parseFloat(spatialvalue.split(", ")[3]);

            let center_lon = (lon_min + lon_max) / 2;
            let center_lat = (lat_min + lat_max) / 2;

            // Add feature
            let feature_point = {
              "type": "Feature",
              "properties": properties,
              "geometry": {
                "type": "Point",
                "coordinates": [center_lon, center_lat],
              },
            };

            let feature_polygon = {
              "type": "Feature",
              "properties": properties,
              "geometry": {
                "type": "Polygon",
                "coordinates": [
                  [
                    [lon_min, lat_min],
                    [lon_max, lat_min],
                    [lon_max, lat_max],
                    [lon_min, lat_max],
                    [lon_min, lat_min],
                  ],
                ],
              },
            };

            // Extend the list with "feature_polygon", if the polygons should be included
            geoJSON["features"] = geoJSON["features"].concat([feature_point]);
          }

          // Check if another page is available, if not, break the While-loop
          if (items.length == 100) {
            page_count += 1;
          } else {
            break;
          }
        }

        msg.payload = JSON.parse(JSON.stringify(geoJSON));
        send(msg);

        let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully created" };
        this.status(info);
        done();
      } catch (e) {
        console.log(e);
        done(e);
        let info: any = { fill: "red", shape: "dot", text: "Stopped request because of error" };
        this.status(info);
      }
    }
  }

  RED.nodes.registerType("UVP", UVPNode);
};
