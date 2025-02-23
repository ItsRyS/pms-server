const axios = require("axios");

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN; // นำจาก Railway Dashboard
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID; // นำจาก Railway Dashboard

const getRailwayServiceStatus = async (req, res) => {
  try {
    const response = await axios.post(
      "https://backboard.railway.app/graphql/v2",
      {
        query: `
          query {
            project(id: "${PROJECT_ID}") {
              services {
                id
                name
                latestDeployment {
                  id
                  status
                  updatedAt
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.error("Response from Railway API:", response.data);
    // ตรวจสอบ Response
    if (!response.data || !response.data.data || !response.data.data.project) {
      return res.status(500).json({ message: "Invalid response from Railway API" });
    }

    const services = response.data.data.project.services.map((service) => ({
      id: service.id,
      name: service.name,
      status: service.latestDeployment ? service.latestDeployment.status : "UNKNOWN",
      updatedAt: service.latestDeployment ? service.latestDeployment.updatedAt : null,
    }));

    res.status(200).json({ services });
  } catch (error) {
    console.error("Error fetching Railway service status:", error);
    res.status(500).json({ message: "Error fetching Railway service status" });
  }
};


module.exports = { getRailwayServiceStatus };
