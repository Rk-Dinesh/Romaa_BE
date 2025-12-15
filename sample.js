 calculate quantites as per category code :           
            consumable_material: MT_CM,
            bulk_material: MT_BL,
            machinery: MY_M,
            fuel: MY_F,
            contractor: MP_C,
            nmr: MP_NMR,

calculation of ItemSchema:
             item_description: "description of category", // example: Hire JCB,Diesel
             category: "MY-M",
             unit: "unit of category", // example: Month, Lit
             quantity: "(quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ",
             total_item_quantity: "sum of quantity array in itemschema in description (Hire JCB) i.e (2/855.36)*1110 + (0.5/684.288)*1110",
             unit_rate: "rate of category",
             total_amount: "quantity * unit_rate",


const boqCSv = `item_id,item_name,description,specifications,unit,quantity,n_rate,n_amount,remarks,work_section
ABS001,EARTH WORK,Laying and curing concrete for foundation,"M20 grade, 28-day curing, compressive strength 20 N/mm²",m3,1011,199.90,202098.9,Use M20 mix,Foundation
ABS002,Refilling,Brick work in cement mortar 1:6,"First class bricks, modular size 225×112×75mm, 1:6 cement mortar mix",m2,380,38.95,14801,Proper alignment required,Superstructure
`;

boq dynamically fetch based on item_No 

const sampleCSv = `itemNo,category,description,unit,working_quantity,rate
ABS001,MAIN_ITEM,,Cum,855.36,
ABS001,MY-M,Hire JCB,Month,2,80000
ABS001,MY-M,Tractor,Month,1,45000
ABS001,MY-F,Diesel,Lit,1275,96
ABS001,MP-C,Blasting,Points,1100,180
ABS001,MP-NMR,Helpers,Nos,60,700
ABS002,MAIN_ITEM,,Cum,684.288,
ABS002,MY-M,Hire JCB,Month,0.5,80000
ABS002,MY-F,Diesel,Lit,112.5,96
ABS002,MP-NMR,Helpers,Nos,15,700
`;

// in the csv file

//   ABS001 is itemNo

// MY-M is category
// Hire JCB is description
// Month is unit
// formula for quantity: (quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ
    // quantity of category: 2
    // working quantity of MAIN_ITEM: 855.36
    // quantity from BOQ: 1110
    // quantity: (2/855.36)*1110 = 2.6666666666666665 to be fixed to 2.67

// ABS002 is itemNo

// MY-M is category
// Hire JCB is description
// Month is unit
// formula for quantity: (quantity of category/working quantity of MAIN_ITEM) * quantity from BOQ
    // quantity of category: 0.5
    // working quantity of MAIN_ITEM: 684.288
    // quantity from BOQ: 380    // quantity: (0.5/684.288)*380 = 0.2857142857142857 to be fixed to 0.29

//total_item_quantity: sum of quantity array in itemschema in description (Hire JCB) i.e (2/855.36)*1110 + (0.5/684.288)*380 = 2.67 + 0.29 = 2.96


{
    "tender_id":"TND014",
    "quantites":{
        "consumable_material": [],
        "bulk_material": [],
        "machinery": [
            {
                "item_description": "Hire JCB", 
                "category": "MY-M",
                "unit": "Month", 
                "quantity":[2.67,0.29],
                "total_item_quantity": 2.96,
                "unit_rate": 80000,
                "total_amount": 236800,
            },
            {
                "item_description": "Tractor", 
                "category": "MY-M",
                "unit": "Month", 
                "quantity":[1.67],
                "total_item_quantity": 1.67,
                "unit_rate": 45000,
                "total_amount": 75000,
            }
        ],
        "fuel": [
            {
                "item_description": "Diesel", 
                "category": "MY-F",
                "unit": "Lit", 
                "quantity":[1624.52 ,58.45],
                "total_item_quantity":1682.97,
                "unit_rate": 96,
                "total_amount":161565.12,
            }
        ],
        "contractor": [
            {
                "item_description": "Blasting", 
                "category": "MP-C", 
                "unit": "Points", 
                "quantity":[1800],
                "total_item_quantity": 1800,
                "unit_rate": 180,
                "total_amount": 324000,
            }
        ],
        "nmr": [
            {
                "item_description": "Helpers", 
                "category": "MP-NMR",
                "unit": "Nos", 
                "quantity":[81.66,8.16],
                "total_item_quantity": 89.82,
                "unit_rate": 700,
                "total_amount": 62874,
            }
        ]
    }
}


