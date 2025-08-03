async function toast (data,type){

    if(type){
        sessionStorage.setItem('toastMessage', data?.message ?? "Something went wrong");
        sessionStorage.setItem('toastType',"error");
    }else{
    sessionStorage.setItem('toastMessage', data?.message ?? "Updated successfully");
    sessionStorage.setItem('toastType',"success");
    }
     window.setTimeout(() => window.location.reload(), 10);
}
 window.addEventListener('DOMContentLoaded', () => {
    const message = sessionStorage.getItem('toastMessage');
    const type = sessionStorage.getItem('toastType');
    if (message) {
        console.log('in if...')
        Toastify({
            text: message,
            duration: 1500,
            close: true,
            gravity: "top",
            position: "right",
            stopOnFocus: true,
            style: {
                background: type === "error" ? "#dc3545" : "#28a745",
                borderRadius: "10px",
                padding: "10px 20px",
                fontWeight: "500",
            }
        }).showToast();

        console.log('out if')
        // Remove message after showing once
        sessionStorage.removeItem('toastMessage');
        sessionStorage.removeItem('toastType');
        console.log('delete sesssion strg')
    }
});