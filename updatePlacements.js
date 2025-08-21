// Load environment variables from .env file
require('dotenv').config();

const mysql = require('mysql2/promise');
const axios = require('axios');

const LITE_API_URL = 'https://api.liteapi.travel/v3.0/data/places';

/**
 * Fetches the placeId for a given location name from the LiteAPI.
 * @param {string} locationName - The name of the location to search for.
 * @returns {Promise<string|null>} The placeId or null if not found.
 */
async function getPlaceId(locationName) {
  try {
    const response = await axios.get(LITE_API_URL, {
      params: {
        textQuery: locationName,
        type: 'geocode',
        language: 'en',
      },
      headers: {
        'X-API-Key': process.env.LITE_API_KEY,
      },
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      // Return the placeId of the first result
      return response.data.data[0].placeId;
    } else {
      console.log(`No placeId found for "${locationName}"`);
      return null;
    }
  } catch (error) {
    // Axios encapsulates the error, so we check error.response for API errors
    if (error.response) {
        console.error(`Error fetching placeId for "${locationName}": Status ${error.response.status} - ${error.response.statusText}`);
    } else {
        console.error(`Error fetching placeId for "${locationName}":`, error.message);
    }
    return null;
  }
}

/**
 * Main function to run the script.
 */
async function main() {
  let connection;
  try {
    // Connect to the database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    console.log('Successfully connected to the database.');

    // Fetch all locations that don't have a placement_id yet
    const [locations] = await connection.execute('SELECT location_id, name FROM location_l10n WHERE placement_id IS NULL');

    if (locations.length === 0) {
        console.log("No locations found that need a placement_id. Exiting.");
        return;
    }

    console.log(`Found ${locations.length} locations to process. Processing sequentially...`);

    let updatedCount = 0;
    for (const location of locations) {
        console.log(`Processing location: "${location.name}"...`);
        const placeId = await getPlaceId(location.name);

        if (placeId) {
            console.log(`Updating location "${location.name}" (ID: ${location.location_id}) with placement_id: ${placeId}`);
            await connection.execute(
                'UPDATE location_l10n SET placement_id = ? WHERE location_id = ?',
                [placeId, location.location_id]
            );
            updatedCount++;
        }
    }

    console.log(`Processing complete. Successfully updated ${updatedCount} locations.`);

  } catch (error) {
    console.error('An error occurred during the process:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

main();
