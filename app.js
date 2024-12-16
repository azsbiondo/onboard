const express = require("express");
const multer = require("multer");
const mondaySdk = require("monday-sdk-js");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const app = express();
const port = 3000;

const mondayClient = mondaySdk();
const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ0NzkwNDc5NywiYWFpIjoxMSwidWlkIjo2OTU2OTQ1MywiaWFkIjoiMjAyNC0xMi0xM1QxMjo0MTowMC4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjU1MjExNCwicmduIjoidXNlMSJ9.gfMwhueufatsv2_dwzCchZit6Ivqp2KZjkJm5EeNRZc';
const boardId = 1039584332;

mondayClient.setToken(apiKey);

// User IDs from your list
const GABRIELLA_ID = 27766254;
const TONY_ID = 43218695;
const STEPHANIE_ID = 32127964;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function excelDateToJSDate(serial) {
  const d = new Date(Math.round((serial - 25569)*86400*1000));
  const year = d.getFullYear();
  let month = (d.getMonth()+1).toString().padStart(2,'0');
  let day = d.getDate().toString().padStart(2,'0');
  return `${year}-${month}-${day}`;
}

// Add days to a YYYY-MM-DD date string and return new YYYY-MM-DD
function addDaysToDate(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  dateObj.setDate(dateObj.getDate() + days);
  const newY = dateObj.getFullYear();
  const newM = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const newD = dateObj.getDate().toString().padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

app.post("/upload", upload.single("file"), async (req, res) => {
  console.log("File upload initiated");

  if (!req.file) {
    console.log("No file uploaded.");
    return res.status(400).send("No file uploaded.");
  }

  console.log(`File uploaded: ${req.file.originalname}`);

  const filePath = path.join(__dirname, 'uploads', req.file.originalname);

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const getCellValue = (cellAddress) => {
      const cell = sheet[cellAddress];
      return cell ? cell.v : "";
    };

    const itemNameRaw = getCellValue("B5");
    const itemName = (itemNameRaw && itemNameRaw.toString().trim() !== "") ? itemNameRaw.toString() : "None Provided";

    // date4 = B4, date = B4 + 9 days
    let baseDateVal = getCellValue("B4");
    baseDateVal = baseDateVal && !isNaN(baseDateVal) ? excelDateToJSDate(Number(baseDateVal)) : (baseDateVal || "");
    let date4Val = baseDateVal || "";
    let dateVal = date4Val ? addDaysToDate(date4Val, 9) : "";

    let dropdown5Val = getCellValue("B6");
    let dropdown57Val = getCellValue("D5");

    const toStr = (val) => (val && val.toString().trim() !== "") ? val.toString() : null;
    dropdown5Val = toStr(dropdown5Val);
    dropdown57Val = toStr(dropdown57Val);

    // Build main item column values
    let columnValuesObj = {};
    if (date4Val) columnValuesObj["date4"] = date4Val;
    if (dateVal) columnValuesObj["date"] = dateVal;
    if (dropdown5Val) columnValuesObj["dropdown5"] = dropdown5Val;
    if (dropdown57Val) {
      columnValuesObj["dropdown57"] = { "labels": [dropdown57Val] };
    }
    columnValuesObj["status7"] = { "label": "Pending" };

    // Create main item
    const mainItemId = await createOnboardingTask(itemName, columnValuesObj);

    // After creating main item, create sub-items
    const b23Val = getCellValue("B23").toString().trim().toLowerCase();
    const b28Val = getCellValue("B28").toString().trim().toLowerCase();

    const baseDate = baseDateVal; // B4 date

    if (mainItemId) {
      // Sub-item 1: "Business Cards"
      // If B23 = "yes" => Gabriella Gooden, status=Pending, date0 = B4+9
      // If "no" => status=None
      if (b23Val === "yes") {
        await createSubitem(mainItemId, "Business Cards", {
          "person": { "personsAndTeams": [{ "id": GABRIELLA_ID, "kind": "person" }] },
          "status": { "label": "Pending" },
          "date0": addDaysToDate(baseDate, 9)
        });
      } else {
        await createSubitem(mainItemId, "Business Cards", {
          "status": { "label": "None" }
        });
      }

      // Sub-item 2: "Take Employee Photo"
      // Tony Fons, status=Pending, date0=B4
      await createSubitem(mainItemId, "Take Employee Photo", {
        "person": { "personsAndTeams": [{ "id": TONY_ID, "kind": "person" }] },
        "status": { "label": "Pending" },
        "date0": baseDate
      });

      // Sub-item 3: "Process Employee Photo / Intranet"
      // Stephanie Provatas, status=Pending, date0=B4+2
      await createSubitem(mainItemId, "Process Employee Photo / Intranet", {
        "person": { "personsAndTeams": [{ "id": STEPHANIE_ID, "kind": "person" }] },
        "status": { "label": "Pending" },
        "date0": addDaysToDate(baseDate, 2)
      });

      // Sub-item 4: "Office Name"
      // If B28 = "yes" => Stephanie Provatas, status=Pending, date0=B4-5
      // If "no" => status=None
      if (b28Val === "yes") {
        await createSubitem(mainItemId, "Office Name", {
          "person": { "personsAndTeams": [{ "id": STEPHANIE_ID, "kind": "person" }] },
          "status": { "label": "Pending" },
          "date0": addDaysToDate(baseDate, -5)
        });
      } else {
        await createSubitem(mainItemId, "Office Name", {
          "status": { "label": "None" }
        });
      }
    }

    console.log("Task creation initiated.");
    res.status(200).send("File uploaded and task (with sub-items) created successfully!");

  } catch (error) {
    console.error("Error processing the file:", error);
    res.status(500).send("Error processing the file.");
  }
});

const createOnboardingTask = async (itemName, columnValuesObj) => {
  console.log("Creating onboarding task for item:", itemName);
  const columnValuesStr = JSON.stringify(columnValuesObj).replace(/"/g, '\\"');

  const query = `
    mutation {
      create_item (board_id: ${boardId}, item_name: "${itemName}", column_values: "${columnValuesStr}") {
        id
      }
    }
  `;
  console.log("Final GraphQL query (main item):", query);

  try {
    const response = await mondayClient.api(query);
    console.log("Task creation response:", response);
    if (response.data && response.data.create_item && response.data.create_item.id) {
      return response.data.create_item.id;
    }
    return null;
  } catch (error) {
    console.error("Error creating task:", error);
    return null;
  }
};

const createSubitem = async (parentItemId, subitemName, columnValuesObj) => {
  const columnValuesStr = JSON.stringify(columnValuesObj).replace(/"/g, '\\"');

  const query = `
    mutation {
      create_subitem (parent_item_id: ${parentItemId}, item_name: "${subitemName}", column_values: "${columnValuesStr}") {
        id
      }
    }
  `;
  console.log("Final GraphQL query (sub-item):", query);

  try {
    const response = await mondayClient.api(query);
    console.log(`Subitem "${subitemName}" creation response:`, response);
  } catch (error) {
    console.error(`Error creating subitem "${subitemName}":`, error);
  }
};

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
