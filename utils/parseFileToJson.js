import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import csvParser from "csv-parser";

export const parseFileToJson = (filePath, originalName) => {
  return new Promise(async (resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase();
    const rows = [];

    // CASE 1: Excel Files (.xlsx, .xls)
    if (ext === ".xlsx" || ext === ".xls") {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath); // ExcelJS is Promise-based

        const worksheet = workbook.getWorksheet(1); // Get the first sheet

        // The first row is usually the header
        const headerRow = worksheet.getRow(1);
        const headers = [];
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber] = cell.text.trim();
        });

        // Iterate through all rows after the header
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;

          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              let value = cell.value;

              // FIX: Handle RichText Objects
              if (value && typeof value === "object") {
                if (value.richText) {
                  // Join all text fragments into one single string
                  value = value.richText.map((rt) => rt.text).join("");
                } else if (value.result !== undefined) {
                  // Handle Formula results
                  value = value.result;
                }
              }

              // Handle trimming if it's a string
              rowData[header] =
                typeof value === "string" ? value.trim() : value;
            }
          });
          rows.push(rowData);
        });

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    }
    // CASE 2: CSV Files
    else if (ext === ".csv") {
      fs.createReadStream(filePath)
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => header.trim(),
          }),
        )
        .on("data", (row) => {
          const trimmedRow = {};
          for (const [key, value] of Object.entries(row)) {
            const cleanKey = key.trim().replace(/^\uFEFF/, ""); // Remove BOM
            trimmedRow[cleanKey] =
              typeof value === "string" ? value.trim() : value;
          }
          rows.push(trimmedRow);
        })
        .on("end", () => resolve(rows))
        .on("error", (error) => reject(error));
    }
    // CASE 3: Unsupported
    else {
      reject(
        new Error("Unsupported file type. Please upload .csv, .xlsx, or .xls"),
      );
    }
  });
};