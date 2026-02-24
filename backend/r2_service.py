"""
Cloudflare R2 Storage Service for Hush Music TV Network
Handles video and image uploads to R2 cloud storage
"""
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from boto3.s3.transfer import TransferConfig
import os
import logging
from typing import Optional, BinaryIO
from io import BytesIO

logger = logging.getLogger(__name__)

# R2 Configuration from environment
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL', '')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', '')
R2_PUBLIC_URL = os.environ.get('R2_PUBLIC_URL', '')

# Transfer configuration for large files
TRANSFER_CONFIG = TransferConfig(
    multipart_threshold=100 * 1024 * 1024,  # 100MB
    multipart_chunksize=50 * 1024 * 1024,   # 50MB per part
    max_concurrency=4,
    use_threads=True
)

def get_r2_client():
    """Create and return a boto3 S3 client configured for Cloudflare R2."""
    if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL]):
        logger.warning("R2 credentials not configured, cloud storage disabled")
        return None
    
    return boto3.client(
        service_name='s3',
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version='s3v4')
    )

def is_r2_configured() -> bool:
    """Check if R2 is properly configured."""
    return all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL, R2_BUCKET_NAME])

def upload_to_r2(
    file_data: bytes,
    object_key: str,
    content_type: str = 'application/octet-stream'
) -> dict:
    """
    Upload file bytes to R2.
    
    Args:
        file_data: The file content as bytes
        object_key: The key (path) where the file will be stored
        content_type: MIME type of the file
        
    Returns:
        Dictionary with success status and URL or error
    """
    if not is_r2_configured():
        return {"success": False, "error": "R2 not configured"}
    
    try:
        client = get_r2_client()
        if not client:
            return {"success": False, "error": "Failed to create R2 client"}
        
        # Upload using put_object for smaller files, multipart for larger
        file_obj = BytesIO(file_data)
        
        client.upload_fileobj(
            file_obj,
            R2_BUCKET_NAME,
            object_key,
            Config=TRANSFER_CONFIG,
            ExtraArgs={'ContentType': content_type}
        )
        
        # Generate public URL
        public_url = get_public_url(object_key)
        
        logger.info(f"Successfully uploaded {object_key} to R2 ({len(file_data)} bytes)")
        
        return {
            "success": True,
            "object_key": object_key,
            "url": public_url,
            "size": len(file_data)
        }
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        logger.error(f"R2 upload failed for {object_key}: {error_code} - {str(e)}")
        return {"success": False, "error": str(e), "error_code": error_code}
    except Exception as e:
        logger.error(f"R2 upload exception for {object_key}: {str(e)}")
        return {"success": False, "error": str(e)}

def upload_file_to_r2(
    file_path: str,
    object_key: str,
    content_type: str = 'application/octet-stream'
) -> dict:
    """
    Upload a file from disk to R2.
    
    Args:
        file_path: Path to the file on disk
        object_key: The key where the file will be stored
        content_type: MIME type of the file
        
    Returns:
        Dictionary with success status and URL or error
    """
    if not is_r2_configured():
        return {"success": False, "error": "R2 not configured"}
    
    try:
        client = get_r2_client()
        if not client:
            return {"success": False, "error": "Failed to create R2 client"}
        
        file_size = os.path.getsize(file_path)
        
        client.upload_file(
            file_path,
            R2_BUCKET_NAME,
            object_key,
            Config=TRANSFER_CONFIG,
            ExtraArgs={'ContentType': content_type}
        )
        
        public_url = get_public_url(object_key)
        
        logger.info(f"Successfully uploaded {file_path} as {object_key} to R2 ({file_size} bytes)")
        
        return {
            "success": True,
            "object_key": object_key,
            "url": public_url,
            "size": file_size
        }
        
    except ClientError as e:
        logger.error(f"R2 file upload failed: {str(e)}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"R2 file upload exception: {str(e)}")
        return {"success": False, "error": str(e)}

def delete_from_r2(object_key: str) -> dict:
    """
    Delete a file from R2.
    
    Args:
        object_key: The key of the file to delete
        
    Returns:
        Dictionary indicating success or failure
    """
    if not is_r2_configured():
        return {"success": False, "error": "R2 not configured"}
    
    try:
        client = get_r2_client()
        if not client:
            return {"success": False, "error": "Failed to create R2 client"}
        
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        
        logger.info(f"Deleted {object_key} from R2")
        return {"success": True, "message": f"Deleted {object_key}"}
        
    except ClientError as e:
        logger.error(f"R2 delete failed for {object_key}: {str(e)}")
        return {"success": False, "error": str(e)}

def get_public_url(object_key: str) -> str:
    """
    Generate the public URL for an R2 object.
    Uses R2's public bucket URL if configured, otherwise generates presigned URL.
    """
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL}/{object_key}"
    else:
        # Fallback to endpoint URL format
        return f"{R2_ENDPOINT_URL}/{R2_BUCKET_NAME}/{object_key}"

def get_presigned_url(object_key: str, expiration: int = 3600) -> Optional[str]:
    """
    Generate a presigned URL for temporary access to a file.
    
    Args:
        object_key: The key of the file
        expiration: How long the URL is valid (in seconds)
        
    Returns:
        The presigned URL string or None on error
    """
    if not is_r2_configured():
        return None
    
    try:
        client = get_r2_client()
        if not client:
            return None
        
        url = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': R2_BUCKET_NAME, 'Key': object_key},
            ExpiresIn=expiration
        )
        return url
        
    except ClientError as e:
        logger.error(f"Failed to generate presigned URL for {object_key}: {str(e)}")
        return None

def check_object_exists(object_key: str) -> bool:
    """Check if an object exists in R2."""
    if not is_r2_configured():
        return False
    
    try:
        client = get_r2_client()
        if not client:
            return False
        
        client.head_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        return True
        
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == '404':
            return False
        logger.error(f"Error checking object {object_key}: {str(e)}")
        return False

def test_r2_connection() -> dict:
    """Test the R2 connection and permissions."""
    if not is_r2_configured():
        return {"success": False, "error": "R2 not configured", "configured": False}
    
    try:
        client = get_r2_client()
        if not client:
            return {"success": False, "error": "Failed to create R2 client", "configured": True}
        
        # Try to list objects (limited to 1) to verify connection
        client.list_objects_v2(Bucket=R2_BUCKET_NAME, MaxKeys=1)
        
        return {
            "success": True,
            "message": "R2 connection successful",
            "bucket": R2_BUCKET_NAME,
            "configured": True
        }
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        return {
            "success": False,
            "error": str(e),
            "error_code": error_code,
            "configured": True
        }
