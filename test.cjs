let savedUsers = [{uid: 'ielts_crm_main_user', email: 'example@crm.com', password: 'admin123', displayName: 'Administrator Name'}];

const defaultAdmin = {
      uid: 'ielts_crm_main_user',
      email: 'crm@example.com',
      password: 'admin123',
      displayName: 'Administrator Name'
    };

    let updated = false;
    for (let i = 0; i < savedUsers.length; i++) {
        if (savedUsers[i].email.toLowerCase() === 'admin@crm.com' && savedUsers[i].uid === 'ielts_crm_main_user') {
            savedUsers[i] = defaultAdmin;
            updated = true;
        }
    }

    const adminExists = savedUsers.some(u => u.email.toLowerCase() === defaultAdmin.email.toLowerCase());
    if (!adminExists) {
      savedUsers.push(defaultAdmin);
      updated = true;
    }
console.log(savedUsers);
