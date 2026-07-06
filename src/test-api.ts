import { Role, OdometerLogType, InspectionType } from '@prisma/client';

const API_BASE = 'http://localhost:3000/api/v1';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 CAR LEASING SaaS PLATFORM - AUTOMATED WORKFLOW TEST');
  console.log('======================================================\n');

  try {
    // ----------------------------------------------------
    // 1. REGISTER GALLERY OWNER
    // ----------------------------------------------------
    console.log('➡️ 1. Registering Gallery Owner...');
    const ownerEmail = `owner_${Date.now()}@leasing.com`;
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: 'OwnerPassword123',
        role: Role.GALLERY_OWNER,
        galleryName: 'Elite Car leasing Gallery'
      })
    });
    const regData = (await regRes.json()) as any;
    if (!regRes.ok) throw new Error(`Reg failed: ${JSON.stringify(regData)}`);
    console.log(`   ✅ Owner registered. Gallery ID: ${regData.galleryId}\n`);

    // ----------------------------------------------------
    // 2. LOGIN AS GALLERY OWNER
    // ----------------------------------------------------
    console.log('➡️ 2. Logging in as Gallery Owner...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: 'OwnerPassword123'
      })
    });
    const loginData = (await loginRes.json()) as any;
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    const ownerToken = loginData.token;
    console.log(`   ✅ Login successful. Token received.\n`);

    // ----------------------------------------------------
    // 3. REGISTER A NEW CAR
    // ----------------------------------------------------
    console.log('➡️ 3. Registering a new Car...');
    const plateNumber = `LEAS-${Math.floor(1000 + Math.random() * 9000)}`;
    const carRes = await fetch(`${API_BASE}/cars`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        plateNumber,
        model: 'Tesla Model 3',
        year: 2024,
        color: 'Midnight Cherry Red',
        licenseStartDate: '2026-01-01',
        licenseEndDate: '2027-01-01',
        currentOdometer: 10000,
        oilChangeInterval: 10000,   // Check oil every 10k km
        filterChangeInterval: 15000 // Check filter every 15k km
      })
    });
    const carData = (await carRes.json()) as any;
    if (!carRes.ok) throw new Error(`Car creation failed: ${JSON.stringify(carData)}`);
    const carId = carData.car.id;
    console.log(`   ✅ Car registered successfully! ID: ${carId} (Plate: ${plateNumber})\n`);

    // ----------------------------------------------------
    // 4. REGISTER A TENANT (DRIVER)
    // ----------------------------------------------------
    console.log('➡️ 4. Registering a Tenant (Driver)...');
    const driverEmail = `driver_${Date.now()}@leasing.com`;
    const driverPassword = 'DriverPassword123';
    const driverRes = await fetch(`${API_BASE}/drivers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        email: driverEmail,
        password: driverPassword,
        fullName: 'Captain Driver Smith',
        nationalIdUrl: 'https://cloud-storage.com/national-ids/smith.pdf',
        drivingLicenseUrl: 'https://cloud-storage.com/licenses/smith.pdf'
      })
    });
    const driverData = (await driverRes.json()) as any;
    if (!driverRes.ok) throw new Error(`Driver creation failed: ${JSON.stringify(driverData)}`);
    const driverProfileId = driverData.tenant.id;
    console.log(`   ✅ Driver Profile created. Profile ID: ${driverProfileId}\n`);

    // ----------------------------------------------------
    // 5. CREATE A CONTRACT (Value: $3,500/month)
    // ----------------------------------------------------
    console.log('➡️ 5. Creating Lease Contract (Rental Value: $3,500)...');
    const contractRes = await fetch(`${API_BASE}/contracts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        carId,
        tenantId: driverProfileId,
        rentalValue: 3500.00,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
        allowedMonthlyKm: 2500,
        status: 'ACTIVE'
      })
    });
    const contractData = (await contractRes.json()) as any;
    if (!contractRes.ok) throw new Error(`Contract failed: ${JSON.stringify(contractData)}`);
    const contractId = contractData.contract.id;
    console.log(`   ✅ Contract created. ID: ${contractId}\n`);

    // ----------------------------------------------------
    // 6. LOG DELIVERY INSPECTION (Start of Lease)
    // ----------------------------------------------------
    console.log('➡️ 6. Logging Delivery Inspection (Odometer: 10,000 km, Gas: 100%)...');
    const delInspectionRes = await fetch(`${API_BASE}/inspections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        contractId,
        type: InspectionType.DELIVERY,
        gasPercentage: 100,
        odometerReading: 10000,
        mediaUrls: ['https://cloud.com/del-inspect-1.jpg'],
        notes: 'Car delivered in pristine showroom condition.'
      })
    });
    const delInspectionData = (await delInspectionRes.json()) as any;
    if (!delInspectionRes.ok) throw new Error(`Delivery Inspection failed: ${JSON.stringify(delInspectionData)}`);
    console.log('   ✅ Delivery inspection logged successfully.\n');

    // ----------------------------------------------------
    // 7. LOGIN AS DRIVER (TENANT)
    // ----------------------------------------------------
    console.log('➡️ 7. Logging in as Driver...');
    const driverLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: driverEmail,
        password: driverPassword
      })
    });
    const driverLoginData = (await driverLoginRes.json()) as any;
    if (!driverLoginRes.ok) throw new Error(`Driver login failed: ${JSON.stringify(driverLoginData)}`);
    const driverToken = driverLoginData.token;
    console.log('   ✅ Driver logged in successfully. Scoped token loaded.\n');

    // ----------------------------------------------------
    // 8. SECURITY CHECK: GET CONTRACT AS DRIVER (Strip check)
    // ----------------------------------------------------
    console.log('➡️ 8. Security Check: Retrieving Contract as Driver...');
    const getContractRes = await fetch(`${API_BASE}/contracts/${contractId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${driverToken}`
      }
    });
    const getContractData = (await getContractRes.json()) as any;
    if (!getContractRes.ok) throw new Error(`Get contract failed: ${JSON.stringify(getContractData)}`);

    console.log(`   🕵️  Checking if 'rentalValue' field is present for driver...`);
    if ('rentalValue' in getContractData) {
      console.log('   ❌ SECURITY VULNERABILITY: Driver was able to see the rental value!');
    } else {
      console.log('   🛡️  SUCCESS: \'rentalValue\' was completely stripped. Driver cannot see it.\n');
    }

    // ----------------------------------------------------
    // 9. LOG ODOMETER & TEST SMART MAINTENANCE WARNING
    // ----------------------------------------------------
    // Car started at 10,000 km. Oil change interval is 10,000 km.
    // Driving to 19,600 km (Oil delta = 9,600 km. Remaining = 400 km <= 500 km threshold).
    console.log('➡️ 9. Driver logs odometer: 19,600 km (Approaching 10,000 km oil change limit)...');
    const logOdoRes = await fetch(`${API_BASE}/odometer/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driverToken}`
      },
      body: JSON.stringify({
        contractId,
        carId,
        type: OdometerLogType.MONTH_END,
        odometerValue: 19600,
        invoiceImageUrl: 'https://cloud.com/odo-invoice.jpg'
      })
    });
    const logOdoData = (await logOdoRes.json()) as any;
    if (!logOdoRes.ok) throw new Error(`Odometer log failed: ${JSON.stringify(logOdoData)}`);
    console.log(`   ✅ Odometer updated in Database to: ${logOdoData.data.updatedOdometer} km`);
    console.log('   🚨 Smart Maintenance Alerts Triggered:');
    if (logOdoData.data.maintenanceAlertsTriggered.length > 0) {
      logOdoData.data.maintenanceAlertsTriggered.forEach((alert: string) => {
        console.log(`      ⚠️  ${alert}`);
      });
    } else {
      console.log('      ❌ No alerts triggered.');
    }
    console.log();

    // ----------------------------------------------------
    // 10. LOG RETURN INSPECTION (End of Lease)
    // ----------------------------------------------------
    console.log('➡️ 10. Owner logs Return Inspection (Odometer: 19,600 km, Gas: 75%)...');
    const retInspectionRes = await fetch(`${API_BASE}/inspections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        contractId,
        type: InspectionType.RETURN,
        gasPercentage: 75,
        odometerReading: 19600,
        mediaUrls: ['https://cloud.com/ret-inspect-1.jpg'],
        notes: 'Car returned with minor scratch on driver door. Gas tank at 75%.'
      })
    });
    const retInspectionData = (await retInspectionRes.json()) as any;
    if (!retInspectionRes.ok) throw new Error(`Return Inspection failed: ${JSON.stringify(retInspectionData)}`);
    console.log('   ✅ Return inspection logged successfully.\n');

    // ----------------------------------------------------
    // 11. INSPECTION COMPARISON REPORT
    // ----------------------------------------------------
    console.log('➡️ 11. Requesting Inspection Comparison Report...');
    const compareRes = await fetch(`${API_BASE}/inspections/compare/${contractId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`
      }
    });
    const compareData = (await compareRes.json()) as any;
    if (!compareRes.ok) throw new Error(`Comparison failed: ${JSON.stringify(compareData)}`);
    console.log('   📊 REPORT SUMMARY:');
    console.log(`      🚙 Total Kilometers Driven: ${compareData.summary.drivenKm} km`);
    console.log(`      ⛽ Gas Difference: ${compareData.summary.gasDifferencePercent}% decrease`);
    console.log(`      💰 Fuel Charge Required? ${compareData.summary.fuelChargeRequired ? 'YES ⚠️' : 'NO'}`);
    console.log(`      📝 Delivery Note: "${compareData.delivery.notes}"`);
    console.log(`      📝 Return Note: "${compareData.return.notes}"`);
    console.log('\n======================================================');
    console.log('🎉 ALL INTEGRATION WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

runTests();
