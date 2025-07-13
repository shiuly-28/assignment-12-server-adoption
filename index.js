const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clustersheauly.6uz8dzi.mongodb.net/?retryWrites=true&w=majority&appName=ClusterSheauly`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db("petAdopton").collection("users");
        const petsCollection = client.db("petAdopton").collection("pets");
        const adoptionsCollection = client.db("petAdopton").collection("adoptions");
        const donationCollection = client.db("petAdopton").collection("donations");
        const myPetsCollection = client.db("petAdopton").collection("mePets");

        // API: get all not adopted pets
        app.get("/pets", async (req, res) => {
            try {
                const pets = await petsCollection
                    .find({ adopted: false })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(pets);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch pets" });
            }
        });

        app.get('/api/mypets', async (req, res) => {
            const userEmail = req.query.email;
            console.log("🎯 Email from frontend:", userEmail);

            try {
                const pets = await petsCollection.find({ userEmail }).toArray(); // ✅ mePets না, petsCollection
                res.send(pets);
            } catch (error) {
                console.error("❌ Error fetching pets:", error);
                res.status(500).send({ message: "Failed to fetch pets", error });
            }
        });

        app.get("/pets/:id", async (req, res) => {
            try {
                const id = req.params.id
                const pets = await petsCollection
                    .findOne({ _id: new ObjectId(id) })

                res.send(pets);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch pets" });
            }
        });

        //  Get Donations with Pagination + Sort by Newest First
        app.get("/donations", async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 6;
                const skip = (page - 1) * limit;

                const result = await donationCollection
                    .find({})
                    .sort({ createdAt: -1 }) // latest first
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch donation campaigns" });
            }
        });

        // POST /donations route
        app.post("/donations", async (req, res) => {
            const donation = req.body;
            donation.createdAt = new Date();
            const result = await donationCollection.insertOne(donation);
            res.send(result);
        });


        app.post("/pets", async (req, res) => {
            try {
                const pet = req.body;
                pet.createdAt = new Date().toISOString();
                pet.adopted = false;

                const result = await petsCollection.insertOne(pet);
                res.status(201).send({ message: "Pet added successfully", id: result.insertedId });
            } catch (error) {
                console.error("Failed to add pet:", error);
                res.status(500).send({ message: "Failed to add pet" });
            }
        });


        // post: Create a new parcel
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const existingUser = await usersCollection.findOne({ email });

            if (existingUser) {
                const updateRes = await usersCollection.updateOne(
                    { email },
                    { $set: { last_log_In: new Date().toISOString() } }
                );
                return res.status(200).send({ message: 'User already exists. Last login updated.', inserted: false, updated: true });
            }

            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // POST route: Save adoption form data
        app.post("/api/adoptions", async (req, res) => {
            const adoptionData = req.body;

            try {
                const result = await adoptionsCollection.insertOne(adoptionData);
                res.status(201).send({
                    message: "Adoption request submitted successfully!",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Failed to insert adoption request:", error);
                res.status(500).send({ error: "Failed to submit adoption request" });
            }
        });


        app.put('/api/pets/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await petCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );
                res.send(result);
            } catch (error) {
                console.error("Failed to update pet", error);
                res.status(500).send({ message: "Failed to update pet" });
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Test route
app.get("/", (req, res) => {
    res.send("Pet Adoption Server is running!");
});

// start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});