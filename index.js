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


        //  route: GET /api/mypets?email=user@example.com
        app.get("/mypets", async (req, res) => {

            try {

                const email = req.query.email;
                console.log(email);
                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const result = await petsCollection.find({ ownerEmail: email }).toArray();
                res.send(result);
            } catch (error) {
                console.error("Failed to fetch pets", error);
                res.status(500).send({ message: "Failed to load pets" });
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


        // Get adoption requests for pets owned by this user
        app.get("/api/adoption", async (req, res) => {
            const userEmail = req.query.userEmail; // 
            try {
                const result = await adoptionsCollection
                    .find({ petUserEmail: userEmail })
                    .toArray();
                res.send(result);
            } catch (error) {
                console.error("Failed to get adoption requests:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });


        // POST route: Save adoption form data
        app.post("/api/adoptions", async (req, res) => {
            const adoptions = req.body;

            try {
                const result = await adoptionsCollection.insertOne(adoptions);
                res.status(201).send({
                    message: "Adoption request submitted successfully!",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Failed to insert adoption request:", error);
                res.status(500).send({ error: "Failed to submit adoption request" });
            }
        });

        app.delete("/api/adoption-requests/:id/reject", async (req, res) => {
            const id = req.params.id;
            const result = await adoptionsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.patch("/api/adoption-requests/:id/accept", async (req, res) => {
            const id = req.params.id;
            const result = await adoptionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "accepted" } }
            );
            res.send(result);
        });

        //  Get Donations with Pagination + Sort by Newest First


        app.get("/donations", async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 6;
                const skip = (page - 1) * limit;
                const sort = req.query.sort === "desc" ? -1 : 1;

                const total = await donationCollection.countDocuments();

                const campaigns = await donationCollection
                    .find()
                    .sort({ createdAt: sort }) // latest first
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                const hasMore = total > page * limit;

                res.send({ campaigns, hasMore });
            } catch (error) {
                console.error("Error in /donations route:", error);
                res.status(500).json({ message: "Server error" });
            }
        });
        app.get("/donations/:id", async (req, res) => {
            try {
                const id = req.params.id;

                // ✅ একক campaign খুঁজে বের করো
                const campaign = await donationCollection.findOne({ _id: new ObjectId(id) });

                if (!campaign) {
                    return res.status(404).json({ message: "Campaign not found" });
                }

                res.send(campaign);
            } catch (error) {
                console.error("❌ Error in /donations/:id route:", error);
                res.status(500).json({ message: "Server error" });
            }
        });


        // POST /donations route
        app.post("/donations", async (req, res) => {
            try {
                const donation = req.body;
                const result = await donationCollection.insertOne(donation);
                res.send(result); // contains insertedId
            } catch (error) {
                res.status(500).send({ error: "Failed to create donation" });
            }
        });

        app.patch("/donations/pause/:id", async (req, res) => {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: "Invalid ID" });
            }

            try {
                const result = await db.collection("donations").updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: "paused" } }  // অথবা তোমার কাঙ্খিত ফিল্ড
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: "Donation not found or already paused" });
                }

                res.json({ message: "Donation paused successfully" });
            } catch (error) {
                console.error("Pause donation error:", error);
                res.status(500).json({ message: "Internal server error" });
            }
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




        app.put('/pets/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await petsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );
                res.send(result);
            } catch (error) {
                console.error("Failed to update pet", error);
                res.status(500).send({ message: "Failed to update pet", error: error.message });
            }
        });

        app.delete("/api/pets/:id", async (req, res) => {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: "Invalid pet ID" });
            }

            try {
                const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "Pet not found" });
                }

                res.json({ deletedCount: result.deletedCount });
            } catch (err) {
                console.error("Delete error:", err);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        // ✅ route: PATCH /api/pets/:id
        app.patch('/api/pets/:id', async (req, res) => {
            const id = req.params.id;
            const updateDoc = {
                $set: {
                    adopted: true,
                },
            };

            const result = await myPetsCollection.updateOne(
                { _id: new ObjectId(id) },
                updateDoc
            );
            res.send(result);
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